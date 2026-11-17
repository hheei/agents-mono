import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, posix, resolve } from "node:path";
import { assertNoControlChars, isLocalHost, type ProcessResult, type ProcessRunner, quoteShell } from "./process";
import type { CachePaths } from "./state";

export interface SshCfg {
	connectTimeout: number;
	aliveInterval: number;
	aliveCountMax: number;
	controlPersist: string;
	strictHostKey: string;
}

export interface TransferResult {
	local: string;
	remote: string;
	kind: "file" | "directory";
}

export function readSshCfg(env: NodeJS.ProcessEnv = process.env): SshCfg {
	return {
		connectTimeout: parsePositiveInt(env.AGENTS_SSH_CONNECT_TIMEOUT, 15, "AGENTS_SSH_CONNECT_TIMEOUT"),
		aliveInterval: parsePositiveInt(env.AGENTS_SSH_ALIVE_INTERVAL, 60, "AGENTS_SSH_ALIVE_INTERVAL"),
		aliveCountMax: parseNonNegativeInt(env.AGENTS_SSH_ALIVE_COUNT_MAX, 3, "AGENTS_SSH_ALIVE_COUNT_MAX"),
		controlPersist: env.AGENTS_SSH_CONTROL_PERSIST?.trim() || "60m",
		strictHostKey: env.AGENTS_SSH_STRICT_HOST_KEY?.trim() || "accept-new",
	};
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
	const val = raw?.trim();
	if (!val) return fallback;
	if (!/^\d+$/.test(val) || Number(val) < 1) throw new Error(`${name} must be a positive integer`);
	return Number(val);
}

function parseNonNegativeInt(raw: string | undefined, fallback: number, name: string): number {
	const val = raw?.trim();
	if (!val) return fallback;
	if (!/^\d+$/.test(val)) throw new Error(`${name} must be a non-negative integer`);
	return Number(val);
}

export function buildSshOptions(ctrlPath: string, cfg: SshCfg): string[] {
	return [
		"-o", `ServerAliveInterval=${cfg.aliveInterval}`,
		"-o", `ServerAliveCountMax=${cfg.aliveCountMax}`,
		"-o", `ConnectTimeout=${cfg.connectTimeout}`,
		"-o", "BatchMode=yes",
		"-o", `StrictHostKeyChecking=${cfg.strictHostKey}`,
		"-o", "ControlMaster=auto",
		"-o", `ControlPath=${ctrlPath}`,
		"-o", `ControlPersist=${cfg.controlPersist}`,
	];
}

export function resolveLocalPath(raw: string | undefined, baseDir: string, defaultName?: string): string {
	const trimmed = raw?.trim();
	if (!trimmed) return defaultName ? join(baseDir, defaultName) : baseDir;
	const home = homedir();
	if (trimmed === "~") return home;
	if (trimmed.startsWith("~/")) return join(home, trimmed.slice(2));
	if (isAbsolute(trimmed)) return resolve(trimmed);
	return resolve(baseDir, trimmed);
}

export class SshTransport {
	readonly #paths: CachePaths;
	readonly #cfg: SshCfg;
	readonly #runner: ProcessRunner;
	readonly #downloadsDir: string;

	constructor(paths: CachePaths, cfg: SshCfg, runner: ProcessRunner, downloadsDir?: string) {
		this.#paths = paths;
		this.#cfg = cfg;
		this.#runner = runner;
		this.#downloadsDir = downloadsDir || join(homedir(), "Downloads");
	}

	async controlPath(host: string): Promise<string> {
		const hostTag = createHash("sha256").update(host).digest("hex").slice(0, 12);
		const candidate = join(this.#paths.controlDir, hostTag);
		if (Buffer.byteLength(candidate, "utf8") <= 96) {
			await mkdir(this.#paths.controlDir, { recursive: true, mode: 0o700 });
			return candidate;
		}
		const dirTag = createHash("sha256").update(this.#paths.controlDir).digest("hex").slice(0, 10);
		return `/tmp/apane-${dirTag}-${hostTag}.sock`;
	}

	async interactiveSshCommand(host: string, remoteShellCmd: string): Promise<string> {
		const ctrlPath = await this.controlPath(host);
		const args = [
			"ssh",
			"-tt",
			...buildSshOptions(ctrlPath, this.#cfg),
			"--",
			host,
			remoteShellCmd,
		];
		return `exec ${args.map(quoteShell).join(" ")}`;
	}

	async exec(host: string, cmd: string, timeoutMs = 15_000, stdin?: string): Promise<ProcessResult> {
		const ctrlPath = await this.controlPath(host);
		const args = [
			...(stdin === undefined ? ["-n"] : []),
			...buildSshOptions(ctrlPath, this.#cfg),
			"--",
			host,
			cmd,
		];
		let res = await this.#runner("ssh", args, timeoutMs, stdin);
		if (!res.timedOut && res.exitCode === 255 && /Control socket connect failed|mux_client|ControlPath/i.test(res.stderr)) {
			await this.#runner("ssh", [...buildSshOptions(ctrlPath, this.#cfg), "-O", "exit", "--", host], 3_000).catch(() => undefined);
			await rm(ctrlPath, { force: true }).catch(() => undefined);
			res = await this.#runner("ssh", args, timeoutMs, stdin);
		}
		return res;
	}

	async writeJobScript(host: string, tok: string, cmd: string): Promise<string> {
		const scriptPath = `/tmp/apane_${tok}.sh`;
		if (isLocalHost(host)) {
			await writeFile(scriptPath, `${cmd}\n`, { mode: 0o600 });
			return scriptPath;
		}
		const res = await this.exec(host, `cat > ${quoteShell(scriptPath)} && chmod 600 ${quoteShell(scriptPath)}`, 15_000, `${cmd}\n`);
		if (res.timedOut || res.exitCode !== 0) {
			throw new Error(`Failed to stage command on ${host}: ${res.stderr.trim() || `exit ${res.exitCode}`}`);
		}
		return scriptPath;
	}

	async download(host: string, cwd: string, remoteRaw: string, localRaw?: string): Promise<TransferResult> {
		const remoteClean = assertNoControlChars(remoteRaw.trim(), "remote");
		const localClean = localRaw ? assertNoControlChars(localRaw.trim(), "local") : undefined;
		const remoteAbs = posix.resolve(cwd, remoteClean);
		const base = posix.basename(remoteAbs) || "download";
		let localAbs = resolveLocalPath(localClean, this.#downloadsDir, base);
		const wantDir = !!localClean && /[\\/]$/.test(localClean);

		if (isLocalHost(host)) {
			const info = await stat(remoteAbs).catch(() => undefined);
			if (!info) throw new Error(`Remote path not found on ${host}: ${remoteAbs}`);
			const existingLocal = await stat(localAbs).catch(() => undefined);
			if (info.isDirectory()) {
				if (existingLocal?.isFile()) throw new Error(`Local target is an existing file: ${localAbs}`);
				if ((wantDir || existingLocal?.isDirectory()) && basename(localAbs) !== base) {
					localAbs = join(localAbs, base);
				}
				await mkdir(dirname(localAbs), { recursive: true });
				await cp(remoteAbs, localAbs, { recursive: true });
				return { local: localAbs, remote: remoteAbs, kind: "directory" };
			}
			if (wantDir || existingLocal?.isDirectory()) localAbs = join(localAbs, base);
			await mkdir(dirname(localAbs), { recursive: true });
			await copyFile(remoteAbs, localAbs);
			return { local: localAbs, remote: remoteAbs, kind: "file" };
		}

		const kind = await this.probeRemoteKind(host, remoteAbs);
		if (kind === "missing") throw new Error(`Remote path not found on ${host}: ${remoteAbs}`);

		const existingLocal = await stat(localAbs).catch(() => undefined);
		if (kind === "file") {
			if (wantDir || existingLocal?.isDirectory()) localAbs = join(localAbs, base);
			await mkdir(dirname(localAbs), { recursive: true });
			await this.runSftpBatch(host, `get -- ${quoteSftp(remoteAbs)} ${quoteSftp(localAbs)}\n`);
			return { local: localAbs, remote: remoteAbs, kind };
		}

		if (existingLocal?.isFile()) throw new Error(`Local target is an existing file: ${localAbs}`);
		if ((wantDir || existingLocal?.isDirectory()) && basename(localAbs) !== base) {
			localAbs = join(localAbs, base);
		}
		await mkdir(dirname(localAbs), { recursive: true });
		await this.runSftpBatch(host, `get -R -- ${quoteSftp(remoteAbs)} ${quoteSftp(localAbs)}\n`);
		return { local: localAbs, remote: remoteAbs, kind };
	}

	async upload(host: string, cwd: string, localRaw: string, remoteRaw?: string): Promise<TransferResult> {
		const localClean = assertNoControlChars(localRaw.trim(), "local");
		const remoteClean = remoteRaw ? assertNoControlChars(remoteRaw.trim(), "remote") : undefined;
		const localAbs = resolveLocalPath(localClean, this.#downloadsDir);
		const info = await stat(localAbs).catch(() => undefined);
		if (!info) throw new Error(`Local path not found: ${localAbs}`);

		const kind: "file" | "directory" = info.isDirectory() ? "directory" : "file";
		const base = basename(localAbs);
		const wantDir = !!remoteClean && remoteClean.endsWith("/");
		let remoteAbs = remoteClean ? posix.resolve(cwd, remoteClean) : posix.join(cwd, base);
		if (wantDir && posix.basename(remoteAbs) !== base) {
			remoteAbs = posix.join(remoteAbs, base);
		}

		if (isLocalHost(host)) {
			const existingRemote = await stat(remoteAbs).catch(() => undefined);
			if (kind === "file") {
				if (existingRemote?.isDirectory()) remoteAbs = posix.join(remoteAbs, base);
				await mkdir(posix.dirname(remoteAbs), { recursive: true });
				await copyFile(localAbs, remoteAbs);
			} else {
				if (existingRemote?.isFile()) throw new Error(`Remote target is an existing file on ${host}: ${remoteAbs}`);
				if (existingRemote?.isDirectory() && posix.basename(remoteAbs) !== base) {
					remoteAbs = posix.join(remoteAbs, base);
				}
				await mkdir(posix.dirname(remoteAbs), { recursive: true });
				await cp(localAbs, remoteAbs, { recursive: true });
			}
			return { local: localAbs, remote: remoteAbs, kind };
		}

		const remoteKind = await this.probeRemoteKind(host, remoteAbs);
		if (kind === "file") {
			if (remoteKind === "directory") remoteAbs = posix.join(remoteAbs, base);
			const prep = await this.exec(host, `mkdir -p -- ${quoteShell(posix.dirname(remoteAbs))}`, 15_000);
			if (prep.timedOut || prep.exitCode !== 0) {
				throw new Error(`Failed to prepare remote directory on ${host}: ${prep.stderr.trim() || `exit ${prep.exitCode}`}`);
			}
			await this.runSftpBatch(host, `put -- ${quoteSftp(localAbs)} ${quoteSftp(remoteAbs)}\n`);
			return { local: localAbs, remote: remoteAbs, kind };
		}

		if (remoteKind === "file") throw new Error(`Remote target is an existing file on ${host}: ${remoteAbs}`);
		const prep = await this.exec(host, `mkdir -p -- ${quoteShell(posix.dirname(remoteAbs))}`, 15_000);
		if (prep.timedOut || prep.exitCode !== 0) {
			throw new Error(`Failed to prepare remote directory on ${host}: ${prep.stderr.trim() || `exit ${prep.exitCode}`}`);
		}
		if (remoteKind === "directory" && base !== posix.basename(remoteAbs)) {
			await this.runSftpBatch(host, `put -R -- ${quoteSftp(localAbs)} ${quoteSftp(remoteAbs)}\n`);
			return { local: localAbs, remote: posix.join(remoteAbs, base), kind };
		}
		const target = remoteKind === "directory" ? posix.dirname(remoteAbs) : remoteAbs;
		await this.runSftpBatch(host, `put -R -- ${quoteSftp(localAbs)} ${quoteSftp(target)}\n`);
		return { local: localAbs, remote: remoteAbs, kind };
	}

	private async probeRemoteKind(host: string, remoteAbs: string): Promise<"file" | "directory" | "missing"> {
		const q = quoteShell(remoteAbs);
		const res = await this.exec(host, `if [ -d ${q} ]; then printf dir; elif [ -e ${q} ]; then printf file; else printf missing; fi`, 10_000);
		if (res.timedOut || res.exitCode !== 0) {
			throw new Error(`Failed to inspect ${remoteAbs} on ${host}: ${res.stderr.trim() || `exit ${res.exitCode}`}`);
		}
		const kind = res.stdout.trim();
		if (kind === "dir") return "directory";
		if (kind === "file") return "file";
		return "missing";
	}

	private async runSftpBatch(host: string, batch: string): Promise<void> {
		const ctrlPath = await this.controlPath(host);
		const args = [
			...buildSshOptions(ctrlPath, this.#cfg),
			"-b", "-",
			"--",
			host,
		];
		const res = await this.#runner("sftp", args, 120_000, batch);
		if (res.timedOut) throw new Error(`SFTP transfer timed out on ${host}`);
		if (res.exitCode !== 0) {
			throw new Error(`SFTP transfer failed on ${host}: ${res.stderr.trim() || res.stdout.trim() || `exit ${res.exitCode}`}`);
		}
	}
}

function quoteSftp(value: string): string {
	return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
