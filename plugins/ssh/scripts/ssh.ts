import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, resolve } from "node:path";
import { isLocalHost, type ProcessResult, type ProcessRunner, quoteShell } from "./process";
import type { CachePaths } from "./state";

export interface SshSettings {
	connectTimeoutSeconds: number;
	serverAliveIntervalSeconds: number;
	serverAliveCountMax: number;
	controlPersist: string;
	strictHostKeyChecking: string;
}

export interface TransferResult {
	id: string;
	host: string;
	localPath: string;
	remotePath: string;
	kind: "file" | "directory";
}

export function readSshSettings(environment: NodeJS.ProcessEnv = process.env): SshSettings {
	return {
		connectTimeoutSeconds: parsePositiveInt(environment.AGENTS_SSH_CONNECT_TIMEOUT, 15, "AGENTS_SSH_CONNECT_TIMEOUT"),
		serverAliveIntervalSeconds: parsePositiveInt(environment.AGENTS_SSH_ALIVE_INTERVAL, 60, "AGENTS_SSH_ALIVE_INTERVAL"),
		serverAliveCountMax: parseNonNegativeInt(environment.AGENTS_SSH_ALIVE_COUNT_MAX, 3, "AGENTS_SSH_ALIVE_COUNT_MAX"),
		controlPersist: environment.AGENTS_SSH_CONTROL_PERSIST?.trim() || "60m",
		strictHostKeyChecking: environment.AGENTS_SSH_STRICT_HOST_KEY?.trim() || "accept-new",
	};
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
	if (!raw || raw.trim() === "") return fallback;
	if (!/^\d+$/.test(raw.trim()) || Number(raw) < 1) throw new Error(`${name} must be a positive integer`);
	return Number(raw);
}

function parseNonNegativeInt(raw: string | undefined, fallback: number, name: string): number {
	if (!raw || raw.trim() === "") return fallback;
	if (!/^\d+$/.test(raw.trim())) throw new Error(`${name} must be a non-negative integer`);
	return Number(raw);
}

export function buildSshOptions(controlPath: string, settings: SshSettings): string[] {
	return [
		"-o", `ServerAliveInterval=${settings.serverAliveIntervalSeconds}`,
		"-o", `ServerAliveCountMax=${settings.serverAliveCountMax}`,
		"-o", `ConnectTimeout=${settings.connectTimeoutSeconds}`,
		"-o", "BatchMode=yes",
		"-o", `StrictHostKeyChecking=${settings.strictHostKeyChecking}`,
		"-o", "ControlMaster=auto",
		"-o", `ControlPath=${controlPath}`,
		"-o", `ControlPersist=${settings.controlPersist}`,
	];
}

export class SshTransport {
	readonly #paths: CachePaths;
	readonly #settings: SshSettings;
	readonly #runner: ProcessRunner;

	constructor(paths: CachePaths, settings: SshSettings, runner: ProcessRunner) {
		this.#paths = paths;
		this.#settings = settings;
		this.#runner = runner;
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

	async interactiveSshCommand(host: string, remoteShellCommand: string): Promise<string> {
		const controlPath = await this.controlPath(host);
		const args = [
			"ssh",
			"-tt",
			...buildSshOptions(controlPath, this.#settings),
			"--",
			host,
			remoteShellCommand,
		];
		return `exec ${args.map(quoteShell).join(" ")}`;
	}

	async exec(host: string, command: string, timeoutMs = 15_000, stdin?: string): Promise<ProcessResult> {
		const controlPath = await this.controlPath(host);
		const args = [
			...(stdin === undefined ? ["-n"] : []),
			...buildSshOptions(controlPath, this.#settings),
			"--",
			host,
			command,
		];
		let result = await this.#runner("ssh", args, timeoutMs, stdin);
		if (!result.timedOut && result.exitCode === 255 && /Control socket connect failed|mux_client|ControlPath/i.test(result.stderr)) {
			await this.#runner("ssh", [...buildSshOptions(controlPath, this.#settings), "-O", "exit", "--", host], 3_000).catch(() => undefined);
			result = await this.#runner("ssh", args, timeoutMs, stdin);
		}
		return result;
	}

	async writeJobScript(host: string, jobId: string, command: string): Promise<string> {
		const scriptPath = `/tmp/apane_${jobId}.sh`;
		if (isLocalHost(host)) {
			await writeFile(scriptPath, `${command}\n`, { mode: 0o600 });
			return scriptPath;
		}
		const res = await this.exec(host, `cat > ${quoteShell(scriptPath)} && chmod 600 ${quoteShell(scriptPath)}`, 15_000, `${command}\n`);
		if (res.timedOut || res.exitCode !== 0) {
			throw new Error(`Failed to stage command on ${host}: ${res.stderr.trim() || `exit ${res.exitCode}`}`);
		}
		return scriptPath;
	}

	async download(id: string, host: string, cwd: string, remotePath: string, localPath?: string): Promise<TransferResult> {
		const remoteAbs = posix.resolve(cwd, remotePath);
		const defaultLocal = join(this.#paths.downloadsDir, id, posix.basename(remoteAbs) || "root");
		const localAbs = resolve(localPath ?? defaultLocal);
		await mkdir(dirname(localAbs), { recursive: true });

		if (isLocalHost(host)) {
			const info = await stat(remoteAbs);
			if (info.isDirectory()) {
				await cp(remoteAbs, localAbs, { recursive: true });
				return { id, host, localPath: localAbs, remotePath: remoteAbs, kind: "directory" };
			}
			await copyFile(remoteAbs, localAbs);
			return { id, host, localPath: localAbs, remotePath: remoteAbs, kind: "file" };
		}

		const kind = await this.probeRemoteKind(host, remoteAbs);
		if (kind === "missing") throw new Error(`Remote path not found on ${host}: ${remoteAbs}`);

		const batch = kind === "directory"
			? `get -R -- ${quoteSftp(remoteAbs)} ${quoteSftp(localAbs)}\n`
			: `get -- ${quoteSftp(remoteAbs)} ${quoteSftp(localAbs)}\n`;
		await this.runSftpBatch(host, batch);
		return { id, host, localPath: localAbs, remotePath: remoteAbs, kind };
	}

	async upload(id: string, host: string, cwd: string, localPath: string, remotePath?: string): Promise<TransferResult> {
		const localAbs = resolve(localPath);
		const info = await stat(localAbs);
		const kind: "file" | "directory" = info.isDirectory() ? "directory" : "file";
		const remoteAbs = remotePath ? posix.resolve(cwd, remotePath) : posix.join(cwd, basename(localAbs));

		if (isLocalHost(host)) {
			await mkdir(posix.dirname(remoteAbs), { recursive: true });
			if (kind === "directory") {
				await cp(localAbs, remoteAbs, { recursive: true });
			} else {
				await copyFile(localAbs, remoteAbs);
			}
			return { id, host, localPath: localAbs, remotePath: remoteAbs, kind };
		}

		const prep = await this.exec(host, `mkdir -p -- ${quoteShell(posix.dirname(remoteAbs))}`, 15_000);
		if (prep.timedOut || prep.exitCode !== 0) {
			throw new Error(`Failed to prepare remote directory on ${host}: ${prep.stderr.trim() || `exit ${prep.exitCode}`}`);
		}

		let batch: string;
		if (kind === "directory") {
			const remoteKind = await this.probeRemoteKind(host, remoteAbs);
			if (remoteKind === "file") throw new Error(`Remote target is an existing file on ${host}: ${remoteAbs}`);
			if (remoteKind === "directory") {
				const remoteParent = posix.dirname(remoteAbs);
				if (basename(localAbs) === posix.basename(remoteAbs)) {
					batch = `put -R -- ${quoteSftp(localAbs)} ${quoteSftp(remoteParent)}\n`;
				} else {
					batch = `put -R -- ${quoteSftp(localAbs)} ${quoteSftp(remoteAbs)}\n`;
				}
			} else {
				batch = `put -R -- ${quoteSftp(localAbs)} ${quoteSftp(remoteAbs)}\n`;
			}
		} else {
			batch = `put -- ${quoteSftp(localAbs)} ${quoteSftp(remoteAbs)}\n`;
		}

		await this.runSftpBatch(host, batch);
		return { id, host, localPath: localAbs, remotePath: remoteAbs, kind };
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
		const controlPath = await this.controlPath(host);
		const args = [
			...buildSshOptions(controlPath, this.#settings),
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
