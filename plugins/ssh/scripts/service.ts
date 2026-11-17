import { HerdrClient, type HerdrPane, type HerdrTarget } from "./herdr";
import {
	assertNoControlChars,
	isLocalHost,
	optString,
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
	output?: string;
}

export interface CloseResult {
	id: string;
	closed: boolean;
}

const DEFAULT_IDLE_TTL = 1800;
const DEFAULT_SYNC_MS = 15_000;
const DEFAULT_WAIT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;
const SPAWN_READY_MS = 20_000;

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
			if (mode === "ssh") {
				const remoteInit = cwd
					? `cd -- ${quoteShell(cwd)} && ec=0 || ec=$?; printf '__APANE_''READY_%s:%d:%s__\\n' '${id}' "$ec" "$PWD"; [ "$ec" -eq 0 ] || exit "$ec"; exec "\${SHELL:-/bin/sh}" -l`
					: `printf '__APANE_''READY_%s:0:%s__\\n' '${id}' "$PWD"; exec "\${SHELL:-/bin/sh}" -l`;
				const sshCmd = await this.#ssh.interactiveSshCommand(host, remoteInit);
				await this.#herdr.runInPane(target, paneId, sshCmd);
			} else {
				const init = cwd
					? `cd -- ${quoteShell(cwd)} && ec=0 || ec=$?; printf '__APANE_''READY_%s:%d:%s__\\n' '${id}' "$ec" "$PWD"`
					: `printf '__APANE_''READY_%s:0:%s__\\n' '${id}' "$PWD"`;
				await this.#herdr.runInPane(target, paneId, init);
			}

			const matched = await this.#herdr.waitOutput(target, paneId, readyRegex, SPAWN_READY_MS);
			if (!matched) {
				const tail = await this.#herdr.readPane(target, paneId, 40).catch(() => "");
				throw new Error(`Timed out waiting for pane shell on ${host}${tail ? `: ${tail.trim()}` : ""}`);
			}
			const snap = await this.#herdr.readPane(target, paneId, 200);
			const ready = matchLastLine(snap, new RegExp(`^__APANE_READY_${id}:(\\d+):(.*)__$`));
			if (!ready) {
				throw new Error(`Unable to read initial cwd for pane ${id} on ${host}`);
			}
			const ec = Number(ready[1]);
			const actualCwd = ready[2];
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
		if (typeof input.cmd !== "string" || input.cmd.trim() === "" || input.cmd.includes("\0")) {
			throw new Error("cmd must be a non-empty string without NUL");
		}
		const runAsync = input.async === true;
		const timeoutMs = normalizeTimeout(input.timeout_ms, DEFAULT_SYNC_MS);

		const { record, tok, mark } = await withStateLock(this.#paths, async () => {
			const state = await this.reconcileAndGc();
			const pane = findPaneOrThrow(state, id);
			if (pane.status === "busy" && pane.job) {
				throw new Error(`Pane ${id} is busy`);
			}

			const usedToks = state.panes.flatMap((p) => (p.job ? [p.id, p.job.tok] : [p.id]));
			const tok = generateHexId(usedToks);
			const scriptPath = await this.#ssh.writeJobScript(pane.host, tok, input.cmd);
			const mark = `__APANE_START_${tok}__`;
			const target = targetFor(pane);
			const launch = `printf '__APANE_''START_%s__\\n' '${tok}'; . ${quoteShell(scriptPath)}; __apane_ec=$?; rm -f ${quoteShell(scriptPath)}; printf '\\n__APANE_''DONE_%s:%d:%s__\\n' '${tok}' "$__apane_ec" "$PWD"`;

			await this.#herdr.runInPane(target, pane.paneId, launch);
			pane.status = "busy";
			pane.usedAt = this.#now();
			pane.lastJob = undefined;
			pane.job = { tok, mark };
			await writeState(this.#paths, state);
			return { record: { ...pane }, tok, mark };
		});

		if (runAsync) {
			return {
				id,
				status: "busy",
				cwd: record.cwd,
			};
		}

		return await this.awaitJob(record, tok, mark, timeoutMs, 2000);
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
					...(job.exitCode !== undefined ? { exit_code: job.exitCode } : {}),
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
	): Promise<ExecResult> {
		const target = targetFor(record);
		const doneRe = `^__APANE_DONE_${tok}:[0-9]+:.*__$`;
		try {
			await this.#herdr.waitOutput(target, record.paneId, doneRe, timeoutMs);
		} catch (error) {
			await this.dropIfMissing(record.id, error);
			throw error;
		}
		const raw = await this.readPaneSafe(target, record, lines);
		const parsed = parseJobOutput(raw, tok, mark);

		if (parsed.done) {
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

		return {
			id: record.id,
			status: "busy",
			cwd: record.cwd,
			output: truncateOutput(tailLines(parsed.output, 80)),
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

	private async dropIfMissing(id: string, error: unknown): Promise<void> {
		const msg = error instanceof Error ? error.message : String(error);
		if (!/pane_not_found|not found/i.test(msg)) return;
		await withStateLock(this.#paths, async () => {
			const state = await readState(this.#paths);
			const next = state.panes.filter((p) => p.id !== id);
			if (next.length !== state.panes.length) {
				await writeState(this.#paths, { version: 1, panes: next });
			}
		}).catch(() => undefined);
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
					}
				} catch {
					// Ignore transient read errors during reconcile.
				}
			}

			if (pane.status === "idle" && pane.ttl > 0 && now - pane.usedAt > pane.ttl * 1000) {
				let busyFg = false;
				if (pane.mode !== "ssh") {
					const info = await this.#herdr.processInfo(target, pane.paneId);
					if (info && info.foreground_processes.length > 0) busyFg = true;
				}
				if (!busyFg) {
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
	const anyDoneRe = /^__APANE_DONE_[0-9a-f]{6}:\d+:.*__$/;
	if (startIdx < 0) {
		for (let i = lines.length - 1; i >= 0; i -= 1) {
			if (anyDoneRe.test(lines[i]) && !doneRe.test(lines[i])) {
				sliceStart = i + 1;
				break;
			}
		}
	}

	for (let i = lines.length - 1; i >= sliceStart; i -= 1) {
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
	}

	const body = lines.slice(sliceStart).join("\n").replace(/\n+$/, "");
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
