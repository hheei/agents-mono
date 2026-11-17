import { basename } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { HerdrClient, type HerdrPane, type HerdrTarget } from "./herdr";
import {
	assertNoControlChars,
	isControlKey,
	isInterruptKey,
	isLocalHost,
	optString,
	parseKeyToken,
	type ProcessRunner,
	quoteShell,
	reqString,
	runProcess,
	truncateOutput,
	validateHexId,
	validateHost,
} from "./process";
import { readSshCfg, SshTransport, type TransferResult } from "./ssh";
import {
	type CachePaths,
	generateHexId,
	type HerdrMode,
	type PaneRecord,
	type PaneStateFile,
	readState,
	resolveCachePaths,
	withStateLock,
	writeState,
} from "./state";

export interface PaneServiceOptions {
	runner?: ProcessRunner;
	env?: NodeJS.ProcessEnv;
	now?: () => number;
	downloadsDir?: string;
}

export interface PaneInfo {
	id: string;
	host: string;
	status: "idle" | "busy";
	cwd: string;
}

export interface ExecResult {
	id: string;
	status: "idle" | "busy";
	cwd: string;
	exit_code?: number;
	interrupted?: boolean;
	fg?: string;
	tty?: "noecho" | "raw";
	stalled?: boolean;
	output?: string;
}

export interface CloseResult {
	id: string;
	closed: boolean;
}

interface ProbeResult {
	alive: boolean;
	busy: boolean;
	fg?: string;
	tty?: "noecho" | "raw";
	cwd?: string;
}

const DEFAULT_IDLE_TTL = 1800;
const DEFAULT_SYNC_MS = 15_000;
const DEFAULT_WAIT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;
const SPAWN_READY_MS = 20_000;
const WAIT_CHUNK_MS = 2_000;
const FAST_PROBE_MS = 300;

export class PaneService {
	readonly #paths: CachePaths;
	readonly #runner: ProcessRunner;
	readonly #ssh: SshTransport;
	readonly #herdr: HerdrClient;
	readonly #defaultTtl: number;
	readonly #now: () => number;

	constructor(opts: PaneServiceOptions = {}) {
		const env = opts.env ?? process.env;
		this.#paths = resolveCachePaths(env);
		this.#runner = opts.runner ?? runProcess;
		const downloadsDir = opts.downloadsDir ?? (env.AGENTS_SSH_DOWNLOADS_DIR?.trim() || undefined);
		this.#ssh = new SshTransport(this.#paths, readSshCfg(env), this.#runner, downloadsDir);
		this.#herdr = new HerdrClient(this.#runner, this.#ssh);
		this.#defaultTtl = readDefaultTtl(env);
		this.#now = opts.now ?? (() => Date.now());
	}

	async list(): Promise<{ panes: PaneInfo[] }> {
		return await withStateLock(this.#paths, async () => {
			const state = await this.reconcileAndGc();
			await writeState(this.#paths, state);
			return { panes: state.panes.map(toInfo) };
		});
	}

	async spawn(input: { host: string; cwd?: string; ttl?: number }): Promise<PaneInfo> {
		const host = validateHost(reqString(input.host, "host"));
		const cwd = optString(input.cwd, "cwd");
		if (cwd) assertNoControlChars(cwd, "cwd");
		const ttl = normalizeTtl(input.ttl, this.#defaultTtl);

		const remoteHerdr = isLocalHost(host) ? false : await this.#herdr.isRunning(host);
		let mode: HerdrMode;
		let target: HerdrTarget;
		if (isLocalHost(host)) {
			mode = "local";
			target = "local";
		} else if (remoteHerdr) {
			mode = "remote";
			target = host;
		} else {
			mode = "ssh";
			target = "local";
		}

		if (!(await this.#herdr.isRunning(target))) {
			throw new Error(`herdr server is not running on ${target}`);
		}

		const id = await withStateLock(this.#paths, async () => {
			const state = await this.reconcileAndGc();
			const allocated = generateHexId(state.panes.map((p) => p.id));
			await writeState(this.#paths, state);
			return allocated;
		});

		const label = `${id} ${host}`;
		const { wsId, tabId, paneId } = await this.#herdr.allocatePane(
			target,
			label,
			mode === "ssh" ? undefined : cwd,
		);

		try {
			await this.#herdr.renamePane(target, paneId, label).catch(() => undefined);

			const readyRegex = `^__APANE_READY_${id}:[0-9]+:.*__$`;
			const ttySnip = `__apane_t=$(tty 2>/dev/null || true); case "$__apane_t" in /*) ;; *) __apane_t="";; esac`;
			if (mode === "ssh") {
				const remoteInit = cwd
					? `cd -- ${quoteShell(cwd)} && ec=0 || ec=$?; ${ttySnip}; printf '__APANE_''READY_%s:%d:%s:%s:%s__\\n' '${id}' "$ec" "$$" "$__apane_t" "$PWD"; [ "$ec" -eq 0 ] || exit "$ec"; exec "\${SHELL:-/bin/sh}" -l`
					: `${ttySnip}; printf '__APANE_''READY_%s:0:%s:%s:%s__\\n' '${id}' "$$" "$__apane_t" "$PWD"; exec "\${SHELL:-/bin/sh}" -l`;
				const sshCmd = await this.#ssh.interactiveSshCommand(host, remoteInit);
				await this.#herdr.runInPane(target, paneId, sshCmd);
			} else {
				const init = cwd
					? `cd -- ${quoteShell(cwd)} && ec=0 || ec=$?; ${ttySnip}; printf '__APANE_''READY_%s:%d:%s:%s:%s__\\n' '${id}' "$ec" "$$" "$__apane_t" "$PWD"`
					: `${ttySnip}; printf '__APANE_''READY_%s:0:%s:%s:%s__\\n' '${id}' "$$" "$__apane_t" "$PWD"`;
				await this.#herdr.runInPane(target, paneId, init);
			}

			const matched = await this.#herdr.waitOutput(target, paneId, readyRegex, SPAWN_READY_MS);
			if (!matched) {
				const tail = await this.#herdr.readPane(target, paneId, 40).catch(() => "");
				throw new Error(`Timed out waiting for pane shell on ${host}${tail ? `: ${tail.trim()}` : ""}`);
			}
			const snap = await this.#herdr.readPane(target, paneId, 200);
			const ready = matchLastLine(snap, new RegExp(`^__APANE_READY_${id}:(\\d+):(\\d*):([^:\\s]*):(.*)__$`));
			if (!ready) {
				throw new Error(`Unable to read initial cwd for pane ${id} on ${host}`);
			}
			const ec = Number(ready[1]);
			const shellPid = ready[2] ? Number(ready[2]) : undefined;
			const tty = ready[3] || undefined;
			const actualCwd = ready[4];
			if (ec !== 0) {
				throw new Error(`Failed to enter directory ${cwd} on ${host}`);
			}

			const now = this.#now();
			const record: PaneRecord = {
				id,
				host,
				mode,
				wsId,
				tabId,
				paneId,
				...(tty ? { tty } : {}),
				...(shellPid ? { shellPid } : {}),
				cwd: actualCwd,
				status: "idle",
				ttl,
				createdAt: now,
				usedAt: now,
			};

			await withStateLock(this.#paths, async () => {
				const state = await readState(this.#paths);
				state.panes.push(record);
				await writeState(this.#paths, state);
			});

			return toInfo(record);
		} catch (error) {
			await this.#herdr.closePane(target, paneId).catch(() => undefined);
			throw error;
		}
	}

	async exec(input: {
		id: string;
		cmd: string;
		async?: boolean;
		timeout_ms?: number;
	}): Promise<ExecResult> {
		const id = validateHexId(reqString(input.id, "id"));
		if (typeof input.cmd !== "string" || input.cmd.length === 0 || input.cmd.includes("\0")) {
			throw new Error("cmd must be a non-empty string without NUL");
		}
		const runAsync = input.async === true;
		const timeoutMs = normalizeTimeout(input.timeout_ms, DEFAULT_SYNC_MS);

		const plan = await withStateLock(this.#paths, async () => {
			const state = await this.reconcileAndGc();
			const pane = findPaneOrThrow(state, id);
			const target = targetFor(pane);
			const key = parseKeyToken(input.cmd);

			if (pane.status === "busy" && pane.job) {
				if (key) {
					await this.#herdr.sendKeys(target, pane.paneId, [key]);
				} else {
					await this.#herdr.sendText(target, pane.paneId, input.cmd.replaceAll("\r\n", "\n"));
				}
				pane.usedAt = this.#now();
				await writeState(this.#paths, state);
				return {
					kind: "busy-input" as const,
					record: structuredClone(pane),
					tok: pane.job.tok,
					mark: pane.job.mark,
					fastProbe: key ? isInterruptKey(key) : false,
				};
			}

			if (key && isControlKey(key)) {
				await this.#herdr.sendKeys(target, pane.paneId, [key]).catch(() => undefined);
				pane.usedAt = this.#now();
				await writeState(this.#paths, state);
				return {
					kind: "idle-key" as const,
					record: structuredClone(pane),
				};
			}

			if (input.cmd.trim() === "") {
				throw new Error("cmd must be a non-empty string");
			}

			const usedToks = state.panes.flatMap((p) => (p.job ? [p.id, p.job.tok] : [p.id]));
			const tok = generateHexId(usedToks);
			const scriptPath = await this.#ssh.writeJobScript(pane.host, tok, input.cmd);
			const mark = `__APANE_START_${tok}__`;
			const launch = `printf '__APANE_''START_%s__\\n' '${tok}'; . ${quoteShell(scriptPath)}; __apane_ec=$?; rm -f ${quoteShell(scriptPath)}; printf '\\n__APANE_''DONE_%s:%d:%s__\\n' '${tok}' "$__apane_ec" "$PWD"`;

			await this.#herdr.runInPane(target, pane.paneId, launch);
			pane.status = "busy";
			pane.usedAt = this.#now();
			pane.lastJob = undefined;
			pane.job = { tok, mark };
			await writeState(this.#paths, state);
			return {
				kind: "new-job" as const,
				record: structuredClone(pane),
				tok,
				mark,
				fastProbe: false,
			};
		});

		if (plan.kind === "idle-key") {
			const job = plan.record.lastJob;
			return {
				id,
				status: "idle",
				cwd: plan.record.cwd,
				...(job?.exitCode !== undefined ? { exit_code: job.exitCode } : {}),
				...(job?.interrupted ? { interrupted: true } : {}),
			};
		}

		if (runAsync) {
			return {
				id,
				status: "busy",
				cwd: plan.record.cwd,
			};
		}

		return await this.awaitJob(plan.record, plan.tok, plan.mark, timeoutMs, 2000, { fastProbe: plan.fastProbe });
	}

	async wait(input: { id: string; timeout_ms?: number; lines?: number }): Promise<ExecResult> {
		const id = validateHexId(reqString(input.id, "id"));
		const timeoutMs = normalizeTimeout(input.timeout_ms, DEFAULT_WAIT_MS);
		const lines = normalizeLines(input.lines, 2000);

		const snap = await withStateLock(this.#paths, async () => {
			const state = await this.reconcileAndGc();
			const pane = findPaneOrThrow(state, id);
			await writeState(this.#paths, state);
			return structuredClone(pane);
		});

		if (snap.status === "idle" || !snap.job) {
			const target = targetFor(snap);
			if (snap.lastJob) {
				const job = snap.lastJob;
				const raw = await this.readPaneSafe(target, snap, lines);
				const parsed = parseJobOutput(raw, job.tok, job.mark);
				if (parsed.done) {
					return {
						id,
						status: "idle",
						cwd: parsed.cwd ?? snap.cwd,
						exit_code: parsed.exitCode,
						output: truncateOutput(parsed.output),
					};
				}
				return {
					id,
					status: "idle",
					cwd: job.doneCwd ?? snap.cwd,
					...(job.exitCode !== undefined ? { exit_code: job.exitCode } : job.interrupted ? { interrupted: true } : {}),
					output: truncateOutput(parsed.output.trimEnd()),
				};
			}
			const text = await this.readPaneSafe(target, snap, Math.min(lines, 500));
			return {
				id,
				status: "idle",
				cwd: snap.cwd,
				output: truncateOutput(text.trimEnd()),
			};
		}

		return await this.awaitJob(snap, snap.job.tok, snap.job.mark, timeoutMs, lines);
	}

	async download(input: { id: string; remote: string; local?: string }): Promise<TransferResult> {
		const id = validateHexId(reqString(input.id, "id"));
		const remote = assertNoControlChars(reqString(input.remote, "remote"), "remote");
		const local = optString(input.local, "local");
		if (local) assertNoControlChars(local, "local");

		const pane = await withStateLock(this.#paths, async () => {
			const state = await this.reconcileAndGc();
			const found = findPaneOrThrow(state, id);
			found.usedAt = this.#now();
			await writeState(this.#paths, state);
			return { ...found };
		});
		return await this.#ssh.download(pane.host, pane.cwd, remote, local);
	}

	async upload(input: { id: string; local: string; remote?: string }): Promise<TransferResult> {
		const id = validateHexId(reqString(input.id, "id"));
		const local = assertNoControlChars(reqString(input.local, "local"), "local");
		const remote = optString(input.remote, "remote");
		if (remote) assertNoControlChars(remote, "remote");

		const pane = await withStateLock(this.#paths, async () => {
			const state = await this.reconcileAndGc();
			const found = findPaneOrThrow(state, id);
			found.usedAt = this.#now();
			await writeState(this.#paths, state);
			return { ...found };
		});
		return await this.#ssh.upload(pane.host, pane.cwd, local, remote);
	}

	async close(input: { id: string }): Promise<CloseResult> {
		const id = validateHexId(reqString(input.id, "id"));
		return await withStateLock(this.#paths, async () => {
			const state = await this.reconcileAndGc();
			const idx = state.panes.findIndex((p) => p.id === id);
			if (idx < 0) {
				await writeState(this.#paths, state);
				return { id, closed: false };
			}
			const [removed] = state.panes.splice(idx, 1);
			await this.#herdr.closePane(targetFor(removed), removed.paneId).catch(() => undefined);
			await writeState(this.#paths, state);
			return { id, closed: true };
		});
	}

	private async awaitJob(
		record: PaneRecord,
		tok: string,
		mark: string,
		timeoutMs: number,
		lines: number,
		opts: { fastProbe?: boolean } = {},
	): Promise<ExecResult> {
		const target = targetFor(record);
		const doneRe = `^__APANE_DONE_${tok}:[0-9]+:.*__$`;
		const startRev = (await this.#herdr.getPane(target, record.paneId).catch(() => undefined))?.revision;
		const deadline = Date.now() + timeoutMs;

		let raw = "";
		let parsed = { done: false, output: "" } as ReturnType<typeof parseJobOutput>;
		let firstStep = true;
		let lastProbe: ProbeResult | undefined;

		while (true) {
			const remaining = Math.max(1, deadline - Date.now());
			const stepCap = firstStep && opts.fastProbe ? FAST_PROBE_MS : WAIT_CHUNK_MS;
			firstStep = false;
			const stepMs = Math.min(remaining, stepCap);

			let matched = false;
			try {
				matched = await this.#herdr.waitOutput(target, record.paneId, doneRe, stepMs);
			} catch (error) {
				await this.dropIfMissing(record.id, error);
				throw error;
			}

			raw = await this.readPaneSafe(target, record, lines);
			parsed = parseJobOutput(raw, tok, mark);
			if (matched || parsed.done) {
				return await this.finishDone(record, tok, parsed);
			}

			lastProbe = await this.probeForeground(record);
			if (lastProbe && !lastProbe.alive) {
				await this.dropPane(record.id);
				throw new Error(`Pane ${record.id} exited`);
			}
			if (lastProbe && !lastProbe.busy) {
				await delay(80);
				raw = await this.readPaneSafe(target, record, lines);
				parsed = parseJobOutput(raw, tok, mark);
				if (parsed.done) {
					return await this.finishDone(record, tok, parsed);
				}
				return await this.finishInterrupted(record, tok, lastProbe.cwd ?? record.cwd, parsed.output);
			}

			if (Date.now() >= deadline) break;
		}

		lastProbe = lastProbe ?? (await this.probeForeground(record));
		if (lastProbe && !lastProbe.alive) {
			await this.dropPane(record.id);
			throw new Error(`Pane ${record.id} exited`);
		}
		if (lastProbe && !lastProbe.busy) {
			return await this.finishInterrupted(record, tok, lastProbe.cwd ?? record.cwd, parsed.output);
		}

		const endPane = await this.#herdr.getPane(target, record.paneId).catch(() => undefined);
		const stalled = startRev !== undefined && endPane?.revision !== undefined && endPane.revision === startRev;

		return {
			id: record.id,
			status: "busy",
			cwd: lastProbe?.cwd ?? record.cwd,
			...(lastProbe?.fg ? { fg: lastProbe.fg } : {}),
			...(lastProbe?.tty ? { tty: lastProbe.tty } : {}),
			...(stalled ? { stalled: true } : {}),
			output: truncateOutput(tailLines(parsed.output, 80)),
		};
	}

	private async finishDone(
		record: PaneRecord,
		tok: string,
		parsed: { done: boolean; exitCode?: number; cwd?: string; output: string },
	): Promise<ExecResult> {
		const nextCwd = parsed.cwd ?? record.cwd;
		await withStateLock(this.#paths, async () => {
			const state = await readState(this.#paths);
			const pane = state.panes.find((p) => p.id === record.id);
			if (pane && pane.job?.tok === tok) {
				pane.status = "idle";
				pane.cwd = nextCwd;
				pane.usedAt = this.#now();
				pane.lastJob = {
					...pane.job,
					exitCode: parsed.exitCode,
					doneCwd: nextCwd,
				};
				pane.job = undefined;
				await writeState(this.#paths, state);
			}
		});
		return {
			id: record.id,
			status: "idle",
			cwd: nextCwd,
			exit_code: parsed.exitCode,
			output: truncateOutput(parsed.output),
		};
	}

	private async finishInterrupted(
		record: PaneRecord,
		tok: string,
		nextCwd: string,
		output: string,
	): Promise<ExecResult> {
		await withStateLock(this.#paths, async () => {
			const state = await readState(this.#paths);
			const pane = state.panes.find((p) => p.id === record.id);
			if (pane && pane.job?.tok === tok) {
				pane.status = "idle";
				pane.cwd = nextCwd;
				pane.usedAt = this.#now();
				pane.lastJob = {
					...pane.job,
					interrupted: true,
					doneCwd: nextCwd,
				};
				pane.job = undefined;
				await writeState(this.#paths, state);
			}
		});
		return {
			id: record.id,
			status: "idle",
			cwd: nextCwd,
			interrupted: true,
			output: truncateOutput(output),
		};
	}

	private async probeForeground(pane: PaneRecord): Promise<ProbeResult | undefined> {
		const target = targetFor(pane);
		if (pane.mode === "ssh") {
			const localInfo = await this.#herdr.processInfo("local", pane.paneId);
			if (localInfo && localInfo.foreground_processes.length === 0) {
				return { alive: false, busy: false };
			}
			if (pane.tty && pane.shellPid) {
				return await this.#ssh.probeRemoteTty(pane.host, pane.tty, pane.shellPid);
			}
			return undefined;
		}

		const info = await this.#herdr.processInfo(target, pane.paneId);
		if (!info) {
			const exists = await this.#herdr.getPane(target, pane.paneId);
			return exists === undefined ? { alive: false, busy: false } : undefined;
		}

		const kids = info.foreground_processes.filter((p) => p.pid !== info.shell_pid);
		const fgPane = await this.#herdr.getPane(target, pane.paneId).catch(() => undefined);
		const cwd = fgPane?.foreground_cwd ?? fgPane?.cwd ?? kids[0]?.cwd;

		if (kids.length === 0) {
			return { alive: true, busy: false, cwd };
		}

		const leaf = kids[kids.length - 1];
		const rawName = leaf.name || leaf.cmdline.split(/\s+/)[0] || "";
		const fg = rawName ? basename(rawName) : undefined;
		const ttyMode = pane.tty ? await this.#ssh.probeLocalStty(target, pane.tty) : undefined;
		return {
			alive: true,
			busy: true,
			fg,
			tty: ttyMode,
			cwd,
		};
	}

	private async readPaneSafe(target: HerdrTarget, record: PaneRecord, lines: number): Promise<string> {
		try {
			return await this.#herdr.readPane(target, record.paneId, lines);
		} catch (error) {
			await this.dropIfMissing(record.id, error);
			throw error;
		}
	}

	private async dropPane(id: string): Promise<void> {
		await withStateLock(this.#paths, async () => {
			const state = await readState(this.#paths);
			const next = state.panes.filter((p) => p.id !== id);
			if (next.length !== state.panes.length) {
				await writeState(this.#paths, { version: 1, panes: next });
			}
		}).catch(() => undefined);
	}

	private async dropIfMissing(id: string, error: unknown): Promise<void> {
		const msg = error instanceof Error ? error.message : String(error);
		if (!/pane_not_found|not found/i.test(msg)) return;
		await this.dropPane(id);
	}

	private async reconcileAndGc(): Promise<PaneStateFile> {
		const state = await readState(this.#paths);
		if (state.panes.length === 0) return state;

		const liveByTarget = new Map<HerdrTarget, Map<string, HerdrPane>>();
		for (const target of new Set<HerdrTarget>(state.panes.map(targetFor))) {
			try {
				const panes = await this.#herdr.listPanes(target);
				liveByTarget.set(target, new Map(panes.map((p) => [p.pane_id, p])));
			} catch {
				// Keep records if target is temporarily unreachable.
			}
		}

		const now = this.#now();
		const kept: PaneRecord[] = [];
		for (const pane of state.panes) {
			const target = targetFor(pane);
			const liveMap = liveByTarget.get(target);
			if (liveMap && !liveMap.has(pane.paneId)) {
				continue;
			}

			if (pane.status === "busy" && pane.job) {
				let doneSettled = false;
				try {
					const raw = await this.#herdr.readPane(target, pane.paneId, 500);
					const parsed = parseJobOutput(raw, pane.job.tok, pane.job.mark);
					if (parsed.done) {
						const nextCwd = parsed.cwd ?? pane.cwd;
						pane.status = "idle";
						pane.cwd = nextCwd;
						pane.usedAt = now;
						pane.lastJob = {
							...pane.job,
							exitCode: parsed.exitCode,
							doneCwd: nextCwd,
						};
						pane.job = undefined;
						doneSettled = true;
					}
				} catch {
					// Ignore transient read errors during reconcile.
				}

				if (!doneSettled) {
					const probed = await this.probeForeground(pane).catch(() => undefined);
					if (probed && !probed.alive) {
						await this.#herdr.closePane(target, pane.paneId).catch(() => undefined);
						continue;
					}
					if (probed && !probed.busy) {
						const nextCwd = probed.cwd ?? pane.cwd;
						pane.status = "idle";
						pane.cwd = nextCwd;
						pane.usedAt = now;
						pane.lastJob = {
							...pane.job,
							interrupted: true,
							doneCwd: nextCwd,
						};
						pane.job = undefined;
					}
				}
			}

			if (pane.status === "idle" && pane.ttl > 0 && now - pane.usedAt > pane.ttl * 1000) {
				const probed = await this.probeForeground(pane).catch(() => undefined);
				if (!probed?.busy) {
					await this.#herdr.closePane(target, pane.paneId).catch(() => undefined);
					continue;
				}
			}

			kept.push(pane);
		}

		return { version: 1, panes: kept };
	}
}

function targetFor(pane: PaneRecord): HerdrTarget {
	return pane.mode === "remote" ? pane.host : "local";
}

function findPaneOrThrow(state: PaneStateFile, id: string): PaneRecord {
	const pane = state.panes.find((p) => p.id === id);
	if (!pane) throw new Error(`Pane ${id} not found`);
	return pane;
}

function toInfo(pane: PaneRecord): PaneInfo {
	return {
		id: pane.id,
		host: pane.host,
		status: pane.status,
		cwd: pane.cwd,
	};
}

export function parseJobOutput(
	raw: string,
	tok: string,
	mark: string,
): { done: boolean; exitCode?: number; cwd?: string; output: string } {
	const lines = raw.replaceAll("\r\n", "\n").split("\n");
	let startIdx = -1;
	for (let i = lines.length - 1; i >= 0; i -= 1) {
		if (lines[i].trim() === mark) {
			startIdx = i;
			break;
		}
	}

	let sliceStart = startIdx >= 0 ? startIdx + 1 : 0;
	const doneRe = new RegExp(`^__APANE_DONE_${tok}:(\\d+):(.*)__$`);
	const anyStartRe = /^__APANE_START_[0-9a-f]{6}__$/;
	const anyDoneRe = /^__APANE_DONE_[0-9a-f]{6}:\d+:.*__$/;
	if (startIdx < 0) {
		for (let i = lines.length - 1; i >= 0; i -= 1) {
			if (anyDoneRe.test(lines[i]) && !doneRe.test(lines[i])) {
				sliceStart = i + 1;
				break;
			}
		}
	}

	let sliceEnd = lines.length;
	for (let i = sliceStart; i < lines.length; i += 1) {
		const m = lines[i].match(doneRe);
		if (m) {
			const body = lines.slice(sliceStart, i).join("\n").replace(/\n+$/, "");
			return {
				done: true,
				exitCode: Number(m[1]),
				cwd: m[2],
				output: body,
			};
		}
		if (startIdx >= 0 && (anyStartRe.test(lines[i].trim()) || anyDoneRe.test(lines[i]))) {
			sliceEnd = i;
			break;
		}
	}

	const body = lines.slice(sliceStart, sliceEnd).join("\n").replace(/\n+$/, "");
	return { done: false, output: body };
}

function matchLastLine(raw: string, re: RegExp): RegExpMatchArray | undefined {
	const lines = raw.replaceAll("\r\n", "\n").split("\n");
	for (let i = lines.length - 1; i >= 0; i -= 1) {
		const m = lines[i].match(re);
		if (m) return m;
	}
	return undefined;
}

function tailLines(text: string, maxLines: number): string {
	const lines = text.split("\n");
	if (lines.length <= maxLines) return text;
	return lines.slice(-maxLines).join("\n");
}

function readDefaultTtl(env: NodeJS.ProcessEnv): number {
	const raw = env.AGENTS_SSH_IDLE_TTL?.trim();
	if (!raw) return DEFAULT_IDLE_TTL;
	if (!/^\d+$/.test(raw)) throw new Error("AGENTS_SSH_IDLE_TTL must be a non-negative integer");
	return Number(raw);
}

function normalizeTtl(value: number | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	if (!Number.isInteger(value) || value < 0) throw new Error("ttl must be a non-negative integer");
	return value;
}

function normalizeTimeout(value: number | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	if (!Number.isInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
		throw new Error(`timeout_ms must be an integer between 1 and ${MAX_TIMEOUT_MS}`);
	}
	return value;
}

function normalizeLines(value: number | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	if (!Number.isInteger(value) || value < 1 || value > 10_000) {
		throw new Error("lines must be an integer between 1 and 10000");
	}
	return value;
}
