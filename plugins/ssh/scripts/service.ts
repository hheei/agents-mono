import { HerdrClient, type HerdrPane, type HerdrTarget } from "./herdr";
import { isLocalHost, type ProcessRunner, quoteShell, runProcess, truncateOutput, validateHexId, validateHost } from "./process";
import { readSshSettings, SshTransport, type TransferResult } from "./ssh";
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
	environment?: NodeJS.ProcessEnv;
	now?: () => number;
	downloadsDir?: string;
}

export interface PaneSummary {
	id: string;
	host: string;
	status: "idle" | "running";
	cwd: string;
	job_id?: string;
}

export interface ExecResult {
	id: string;
	status: "done" | "running";
	cwd: string;
	exit_code?: number;
	output?: string;
	job_id?: string;
	output_tail?: string;
}

export interface CloseResult {
	id: string;
	closed: boolean;
}

const DEFAULT_IDLE_TTL_SEC = 1800;
const DEFAULT_SYNC_TIMEOUT_MS = 15_000;
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;
const SPAWN_READY_TIMEOUT_MS = 20_000;

export class PaneService {
	readonly #paths: CachePaths;
	readonly #runner: ProcessRunner;
	readonly #ssh: SshTransport;
	readonly #herdr: HerdrClient;
	readonly #defaultIdleTtlSec: number;
	readonly #now: () => number;

	constructor(options: PaneServiceOptions = {}) {
		const env = options.environment ?? process.env;
		this.#paths = resolveCachePaths(env);
		this.#runner = options.runner ?? runProcess;
		const downloadsDir = options.downloadsDir ?? (env.AGENTS_SSH_DOWNLOADS_DIR?.trim() || undefined);
		this.#ssh = new SshTransport(this.#paths, readSshSettings(env), this.#runner, downloadsDir);
		this.#herdr = new HerdrClient(this.#runner, this.#ssh);
		this.#defaultIdleTtlSec = readDefaultIdleTtl(env);
		this.#now = options.now ?? (() => Date.now());
	}

	async list(): Promise<{ panes: PaneSummary[] }> {
		return await withStateLock(this.#paths, async () => {
			const state = await this.reconcileAndGc();
			await writeState(this.#paths, state);
			return { panes: state.panes.map(toSummary) };
		});
	}

	async spawn(input: { host: string; cwd?: string; idle_ttl_sec?: number }): Promise<PaneSummary> {
		const host = validateHost(input.host);
		const cwd = input.cwd?.trim() || undefined;
		if (cwd && /[\0\r\n]/.test(cwd)) throw new Error("cwd must not contain NUL, CR, or LF");
		const idleTtlSec = normalizeIdleTtl(input.idle_ttl_sec, this.#defaultIdleTtlSec);

		const remoteHerdr = isLocalHost(host) ? false : await this.#herdr.isRunning(host);
		let mode: HerdrMode;
		let target: HerdrTarget;
		if (isLocalHost(host)) {
			mode = "local-herdr";
			target = "local";
		} else if (remoteHerdr) {
			mode = "remote-herdr";
			target = host;
		} else {
			mode = "local-herdr-ssh";
			target = "local";
		}

		if (!(await this.#herdr.isRunning(target))) {
			throw new Error(`herdr server is not running on ${target}`);
		}

		const id = await withStateLock(this.#paths, async () => {
			const state = await this.reconcileAndGc();
			const allocatedId = generateHexId(state.panes.map((p) => p.id));
			await writeState(this.#paths, state);
			return allocatedId;
		});

		const { workspaceId, paneId: herdrPaneId } = await this.#herdr.allocatePane(
			target,
			mode === "local-herdr-ssh" ? undefined : cwd,
		);

		try {
			await this.#herdr.renamePane(target, herdrPaneId, `${id} ${host}`).catch(() => undefined);

			const readyRegex = `^__APANE_READY_${id}:[0-9]+:.*__$`;
			if (mode === "local-herdr-ssh") {
				const remoteInit = cwd
					? `cd -- ${quoteShell(cwd)} && ec=0 || ec=$?; printf '__APANE_''READY_%s:%d:%s__\\n' '${id}' "$ec" "$PWD"; [ "$ec" -eq 0 ] || exit "$ec"; exec "\${SHELL:-/bin/sh}" -l`
					: `printf '__APANE_''READY_%s:0:%s__\\n' '${id}' "$PWD"; exec "\${SHELL:-/bin/sh}" -l`;
				const sshCommand = await this.#ssh.interactiveSshCommand(host, remoteInit);
				await this.#herdr.runInPane(target, herdrPaneId, sshCommand);
			} else {
				const init = cwd
					? `cd -- ${quoteShell(cwd)} && ec=0 || ec=$?; printf '__APANE_''READY_%s:%d:%s__\\n' '${id}' "$ec" "$PWD"`
					: `printf '__APANE_''READY_%s:0:%s__\\n' '${id}' "$PWD"`;
				await this.#herdr.runInPane(target, herdrPaneId, init);
			}

			const matched = await this.#herdr.waitOutput(target, herdrPaneId, readyRegex, SPAWN_READY_TIMEOUT_MS);
			if (!matched) {
				const tail = await this.#herdr.readPane(target, herdrPaneId, 40).catch(() => "");
				throw new Error(`Timed out waiting for pane shell on ${host}${tail ? `: ${tail.trim()}` : ""}`);
			}
			const snapshot = await this.#herdr.readPane(target, herdrPaneId, 200);
			const readyMatch = matchLastLine(snapshot, new RegExp(`^__APANE_READY_${id}:(\\d+):(.*)__$`));
			if (!readyMatch) {
				throw new Error(`Unable to read initial cwd for pane ${id} on ${host}`);
			}
			const exitCode = Number(readyMatch[1]);
			const actualCwd = readyMatch[2];
			if (exitCode !== 0) {
				throw new Error(`Failed to enter directory ${cwd} on ${host}`);
			}

			const now = this.#now();
			const record: PaneRecord = {
				id,
				host,
				backend: "herdr",
				mode,
				herdrWorkspaceId: workspaceId,
				herdrPaneId,
				cwd: actualCwd,
				status: "idle",
				idleTtlSec,
				createdAt: now,
				lastUsedAt: now,
			};

			await withStateLock(this.#paths, async () => {
				const state = await readState(this.#paths);
				state.panes.push(record);
				await writeState(this.#paths, state);
			});

			return toSummary(record);
		} catch (error) {
			await this.#herdr.closePane(target, herdrPaneId).catch(() => undefined);
			throw error;
		}
	}

	async exec(input: {
		id: string;
		command: string;
		async?: boolean;
		timeout_ms?: number;
	}): Promise<ExecResult> {
		const id = validateHexId(input.id);
		if (typeof input.command !== "string" || input.command.length === 0 || input.command.includes("\0")) {
			throw new Error("command must be a non-empty string without NUL");
		}
		const runAsync = input.async === true;
		const timeoutMs = normalizeTimeout(input.timeout_ms, DEFAULT_SYNC_TIMEOUT_MS);

		const { record, jobId, startMarker, donePrefix } = await withStateLock(this.#paths, async () => {
			const state = await this.reconcileAndGc();
			const pane = findPaneOrThrow(state, id);
			if (pane.status === "running" && pane.activeJob) {
				throw new Error(`Pane ${id} is busy running job ${pane.activeJob.jobId}`);
			}

			const allocatedJobId = generateHexId(state.panes.flatMap((p) => (p.activeJob ? [p.id, p.activeJob.jobId] : [p.id])));
			const scriptPath = await this.#ssh.writeJobScript(pane.host, allocatedJobId, input.command);
			const sMarker = `__APANE_START_${allocatedJobId}__`;
			const dPrefix = `__APANE_DONE_${allocatedJobId}:`;
			const target = herdrTargetFor(pane);
			const launch = `printf '__APANE_''START_%s__\\n' '${allocatedJobId}'; . ${quoteShell(scriptPath)}; __apane_ec=$?; rm -f ${quoteShell(scriptPath)}; printf '\\n__APANE_''DONE_%s:%d:%s__\\n' '${allocatedJobId}' "$__apane_ec" "$PWD"`;

			await this.#herdr.runInPane(target, pane.herdrPaneId, launch);
			pane.status = "running";
			pane.lastUsedAt = this.#now();
			pane.lastJob = undefined;
			pane.activeJob = {
				jobId: allocatedJobId,
				command: input.command,
				startedAt: pane.lastUsedAt,
				startMarker: sMarker,
				donePrefix: dPrefix,
				scriptPath,
			};
			await writeState(this.#paths, state);
			return {
				record: { ...pane },
				jobId: allocatedJobId,
				startMarker: sMarker,
				donePrefix: dPrefix,
			};
		});

		if (runAsync) {
			return {
				id,
				status: "running",
				cwd: record.cwd,
				job_id: jobId,
			};
		}

		return await this.awaitJob(record, jobId, startMarker, donePrefix, timeoutMs, 2000);
	}

	async wait(input: { id: string; timeout_ms?: number; lines?: number }): Promise<ExecResult> {
		const id = validateHexId(input.id);
		const timeoutMs = normalizeTimeout(input.timeout_ms, DEFAULT_WAIT_TIMEOUT_MS);
		const lines = normalizeLines(input.lines, 2000);

		const snapshotRecord = await withStateLock(this.#paths, async () => {
			const state = await this.reconcileAndGc();
			const pane = findPaneOrThrow(state, id);
			await writeState(this.#paths, state);
			return structuredClone(pane);
		});

		if (snapshotRecord.status === "idle" || !snapshotRecord.activeJob) {
			const target = herdrTargetFor(snapshotRecord);
			if (snapshotRecord.lastJob) {
				const job = snapshotRecord.lastJob;
				const raw = await this.#herdr.readPane(target, snapshotRecord.herdrPaneId, lines);
				const parsed = parseJobOutput(raw, job.jobId, job.startMarker, job.donePrefix);
				if (parsed.done) {
					return {
						id,
						status: "done",
						cwd: parsed.cwd ?? snapshotRecord.cwd,
						exit_code: parsed.exitCode,
						output: truncateOutput(parsed.output),
					};
				}
			}
			const text = await this.#herdr.readPane(target, snapshotRecord.herdrPaneId, Math.min(lines, 500));
			return {
				id,
				status: "done",
				cwd: snapshotRecord.cwd,
				output: truncateOutput(text.trimEnd()),
			};
		}

		const job = snapshotRecord.activeJob;
		return await this.awaitJob(snapshotRecord, job.jobId, job.startMarker, job.donePrefix, timeoutMs, lines);
	}

	async download(input: { id: string; remote_path: string; local_path?: string }): Promise<TransferResult> {
		const id = validateHexId(input.id);
		if (!input.remote_path?.trim()) throw new Error("remote_path must be a non-empty string");
		const pane = await withStateLock(this.#paths, async () => {
			const state = await this.reconcileAndGc();
			const found = findPaneOrThrow(state, id);
			found.lastUsedAt = this.#now();
			await writeState(this.#paths, state);
			return { ...found };
		});
		return await this.#ssh.download(pane.host, pane.cwd, input.remote_path.trim(), input.local_path?.trim() || undefined);
	}

	async upload(input: { id: string; local_path: string; remote_path?: string }): Promise<TransferResult> {
		const id = validateHexId(input.id);
		if (!input.local_path?.trim()) throw new Error("local_path must be a non-empty string");
		const pane = await withStateLock(this.#paths, async () => {
			const state = await this.reconcileAndGc();
			const found = findPaneOrThrow(state, id);
			found.lastUsedAt = this.#now();
			await writeState(this.#paths, state);
			return { ...found };
		});
		return await this.#ssh.upload(pane.host, pane.cwd, input.local_path.trim(), input.remote_path?.trim() || undefined);
	}

	async close(input: { id: string }): Promise<CloseResult> {
		const id = validateHexId(input.id);
		return await withStateLock(this.#paths, async () => {
			const state = await this.reconcileAndGc();
			const index = state.panes.findIndex((p) => p.id === id);
			if (index < 0) {
				await writeState(this.#paths, state);
				return { id, closed: false };
			}
			const [removed] = state.panes.splice(index, 1);
			await this.#herdr.closePane(herdrTargetFor(removed), removed.herdrPaneId).catch(() => undefined);
			await writeState(this.#paths, state);
			return { id, closed: true };
		});
	}

	private async awaitJob(
		record: PaneRecord,
		jobId: string,
		startMarker: string,
		donePrefix: string,
		timeoutMs: number,
		lines: number,
	): Promise<ExecResult> {
		const target = herdrTargetFor(record);
		const doneRegex = `^__APANE_DONE_${jobId}:[0-9]+:.*__$`;
		const matched = await this.#herdr.waitOutput(target, record.herdrPaneId, doneRegex, timeoutMs);
		const raw = await this.#herdr.readPane(target, record.herdrPaneId, lines);
		const parsed = parseJobOutput(raw, jobId, startMarker, donePrefix);

		if (matched && parsed.done) {
			await withStateLock(this.#paths, async () => {
				const state = await readState(this.#paths);
				const pane = state.panes.find((p) => p.id === record.id);
				if (pane && pane.activeJob?.jobId === jobId) {
					pane.status = "idle";
					pane.cwd = parsed.cwd ?? pane.cwd;
					pane.lastUsedAt = this.#now();
					pane.lastJob = pane.activeJob;
					pane.activeJob = undefined;
					await writeState(this.#paths, state);
				}
			});
			return {
				id: record.id,
				status: "done",
				cwd: parsed.cwd ?? record.cwd,
				exit_code: parsed.exitCode,
				output: truncateOutput(parsed.output),
			};
		}

		return {
			id: record.id,
			status: "running",
			cwd: record.cwd,
			job_id: jobId,
			output_tail: truncateOutput(tailLines(parsed.output, 80)),
		};
	}

	private async reconcileAndGc(): Promise<PaneStateFile> {
		const state = await readState(this.#paths);
		if (state.panes.length === 0) return state;

		const liveByTarget = new Map<HerdrTarget, Map<string, HerdrPane>>();
		const targets = new Set<HerdrTarget>(state.panes.map(herdrTargetFor));
		for (const target of targets) {
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
			const target = herdrTargetFor(pane);
			const liveMap = liveByTarget.get(target);
			if (liveMap && !liveMap.has(pane.herdrPaneId)) {
				continue;
			}

			if (pane.status === "running" && pane.activeJob) {
				try {
					const raw = await this.#herdr.readPane(target, pane.herdrPaneId, 500);
					const parsed = parseJobOutput(raw, pane.activeJob.jobId, pane.activeJob.startMarker, pane.activeJob.donePrefix);
					if (parsed.done) {
						pane.status = "idle";
						pane.cwd = parsed.cwd ?? pane.cwd;
						pane.lastUsedAt = now;
						pane.lastJob = pane.activeJob;
						pane.activeJob = undefined;
					}
				} catch {
					// Ignore transient read errors during reconcile.
				}
			}

			if (pane.status === "idle" && pane.idleTtlSec > 0 && now - pane.lastUsedAt > pane.idleTtlSec * 1000) {
				let busyForeground = false;
				if (pane.mode !== "local-herdr-ssh") {
					const info = await this.#herdr.processInfo(target, pane.herdrPaneId);
					if (info && info.foreground_processes.length > 0) busyForeground = true;
				}
				if (!busyForeground) {
					await this.#herdr.closePane(target, pane.herdrPaneId).catch(() => undefined);
					continue;
				}
			}

			kept.push(pane);
		}

		return { version: 1, panes: kept };
	}
}

function herdrTargetFor(pane: PaneRecord): HerdrTarget {
	return pane.mode === "remote-herdr" ? pane.host : "local";
}

function findPaneOrThrow(state: PaneStateFile, id: string): PaneRecord {
	const pane = state.panes.find((p) => p.id === id);
	if (!pane) throw new Error(`Pane ${id} not found`);
	return pane;
}

function toSummary(pane: PaneRecord): PaneSummary {
	return {
		id: pane.id,
		host: pane.host,
		status: pane.status,
		cwd: pane.cwd,
		...(pane.activeJob ? { job_id: pane.activeJob.jobId } : {}),
	};
}

export function parseJobOutput(
	raw: string,
	jobId: string,
	startMarker: string,
	_donePrefix: string,
): { done: boolean; exitCode?: number; cwd?: string; output: string } {
	const lines = raw.replaceAll("\r\n", "\n").split("\n");
	let startIdx = -1;
	for (let i = lines.length - 1; i >= 0; i -= 1) {
		if (lines[i].trim() === startMarker) {
			startIdx = i;
			break;
		}
	}

	const sliceStart = startIdx >= 0 ? startIdx + 1 : 0;
	const doneRe = new RegExp(`^__APANE_DONE_${jobId}:(\\d+):(.*)__$`);
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

function readDefaultIdleTtl(env: NodeJS.ProcessEnv): number {
	const raw = env.AGENTS_SSH_IDLE_TTL?.trim();
	if (!raw) return DEFAULT_IDLE_TTL_SEC;
	if (!/^\d+$/.test(raw)) throw new Error("AGENTS_SSH_IDLE_TTL must be a non-negative integer");
	return Number(raw);
}

function normalizeIdleTtl(value: number | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	if (!Number.isInteger(value) || value < 0) throw new Error("idle_ttl_sec must be a non-negative integer");
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
