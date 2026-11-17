import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rmdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export type HerdrMode = "local-herdr" | "local-herdr-ssh" | "remote-herdr";

export interface ActiveJob {
	jobId: string;
	command: string;
	startedAt: number;
	startMarker: string;
	donePrefix: string;
	scriptPath: string;
}

export interface PaneRecord {
	id: string;
	host: string;
	backend: "herdr";
	mode: HerdrMode;
	herdrWorkspaceId: string;
	herdrPaneId: string;
	cwd: string;
	status: "idle" | "running";
	idleTtlSec: number;
	createdAt: number;
	lastUsedAt: number;
	activeJob?: ActiveJob;
	lastJob?: ActiveJob;
}

export interface PaneStateFile {
	version: 1;
	panes: PaneRecord[];
}

export interface CachePaths {
	root: string;
	stateFile: string;
	lockDir: string;
	controlDir: string;
	downloadsDir: string;
}

const LOCK_TIMEOUT_MS = 10_000;
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 40;

export function resolveCachePaths(environment: NodeJS.ProcessEnv = process.env): CachePaths {
	const root = environment.AGENTS_SSH_CACHE_DIR?.trim()
		|| join(environment.XDG_CACHE_HOME?.trim() || join(homedir(), ".cache"), "agents-ssh");
	return {
		root,
		stateFile: join(root, "state.json"),
		lockDir: join(root, "state.lock"),
		controlDir: join(root, "control"),
		downloadsDir: join(root, "downloads"),
	};
}

export function generateHexId(existing: Iterable<string>): string {
	const taken = new Set(existing);
	for (let attempt = 0; attempt < 64; attempt += 1) {
		const candidate = randomBytes(3).toString("hex");
		if (!taken.has(candidate)) return candidate;
	}
	throw new Error("Unable to allocate unique 6-character hex id");
}

export async function withStateLock<T>(paths: CachePaths, fn: () => Promise<T>): Promise<T> {
	await mkdir(paths.root, { recursive: true, mode: 0o700 });
	const deadline = Date.now() + LOCK_TIMEOUT_MS;
	while (true) {
		try {
			await mkdir(paths.lockDir, { mode: 0o700 });
			break;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "EEXIST") throw error;
			const info = await stat(paths.lockDir).catch(() => undefined);
			if (info && Date.now() - info.mtimeMs > LOCK_STALE_MS) {
				await rmdir(paths.lockDir).catch(() => undefined);
				continue;
			}
			if (Date.now() >= deadline) {
				throw new Error(`Timed out waiting for state lock: ${paths.lockDir}`);
			}
			await delay(LOCK_RETRY_MS);
		}
	}

	try {
		return await fn();
	} finally {
		await rmdir(paths.lockDir).catch(() => undefined);
	}
}

export async function readState(paths: CachePaths): Promise<PaneStateFile> {
	try {
		const raw = await readFile(paths.stateFile, "utf8");
		const parsed = JSON.parse(raw) as Partial<PaneStateFile>;
		if (parsed && Array.isArray(parsed.panes)) {
			return { version: 1, panes: parsed.panes };
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			// Fall through to empty state if file was corrupt.
		}
	}
	return { version: 1, panes: [] };
}

export async function writeState(paths: CachePaths, state: PaneStateFile): Promise<void> {
	await mkdir(paths.root, { recursive: true, mode: 0o700 });
	const tempPath = `${paths.stateFile}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
	await rename(tempPath, paths.stateFile);
}
