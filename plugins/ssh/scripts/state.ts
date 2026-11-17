import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rmdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export type HerdrMode = "local" | "ssh" | "remote";

export interface JobState {
	tok: string;
	mark: string;
	exitCode?: number;
	doneCwd?: string;
	interrupted?: boolean;
}

export interface PaneRecord {
	id: string;
	host: string;
	mode: HerdrMode;
	wsId: string;
	tabId: string;
	paneId: string;
	tty?: string;
	shellPid?: number;
	cwd: string;
	status: "idle" | "busy";
	ttl: number;
	createdAt: number;
	usedAt: number;
	job?: JobState;
	lastJob?: JobState;
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
}

const LOCK_TIMEOUT_MS = 10_000;
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 40;

export function resolveCachePaths(env: NodeJS.ProcessEnv = process.env): CachePaths {
	const custom = env.AGENTS_SSH_CACHE_DIR?.trim();
	const xdg = env.XDG_CACHE_HOME?.trim();
	const root = custom || join(xdg || join(homedir(), ".cache"), "agents-ssh");
	return {
		root,
		stateFile: join(root, "state.json"),
		lockDir: join(root, "state.lock"),
		controlDir: join(root, "control"),
	};
}

export function generateHexId(existing: Iterable<string> = []): string {
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
			return { version: 1, panes: parsed.panes.filter(isValidRecord) };
		}
	} catch {
		// Fall through to empty state if missing or corrupt.
	}
	return { version: 1, panes: [] };
}

export async function writeState(paths: CachePaths, state: PaneStateFile): Promise<void> {
	await mkdir(paths.root, { recursive: true, mode: 0o700 });
	const tmp = `${paths.stateFile}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
	await rename(tmp, paths.stateFile);
}

function isValidRecord(value: unknown): value is PaneRecord {
	if (!value || typeof value !== "object") return false;
	const r = value as Partial<PaneRecord>;
	return typeof r.id === "string"
		&& typeof r.host === "string"
		&& typeof r.wsId === "string"
		&& typeof r.paneId === "string"
		&& typeof r.cwd === "string"
		&& (r.status === "idle" || r.status === "busy");
}
