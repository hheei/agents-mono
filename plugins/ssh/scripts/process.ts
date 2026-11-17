import { spawn } from "node:child_process";

export interface ProcessResult {
	exitCode: number | null;
	stdout: string;
	stderr: string;
	timedOut?: boolean;
}

export type ProcessRunner = (
	command: string,
	args: string[],
	timeoutMs: number,
	stdin?: string,
) => Promise<ProcessResult>;

const OUTPUT_EDGE_BYTES = 8 * 1024;

export function validateHost(value: string): string {
	const host = value.trim();
	if (host === "") throw new Error("host must be a non-empty string");
	if (host.startsWith("-")) throw new Error("host must not start with '-'");
	if (/[\0\r\n\t ]/.test(host)) throw new Error("host must not contain whitespace");
	if (/[\/:]/.test(host)) throw new Error("host must not contain '/' or ':'; use an OpenSSH alias or 'local'");
	return host;
}

export function validateHexId(value: string): string {
	const id = value.trim();
	if (!/^[0-9a-f]{6}$/.test(id)) {
		throw new Error("id must be a 6-character lowercase hex pane id");
	}
	return id;
}

export function quoteShell(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

export function isLocalHost(host: string): boolean {
	return host === "local" || host === "localhost";
}

export async function runProcess(
	command: string,
	args: string[],
	timeoutMs: number,
	stdin?: string,
): Promise<ProcessResult> {
	return await new Promise((resolve) => {
		const child = spawn(command, args, {
			stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
		});
		const stdout = new BoundedOutput();
		const stderr = new BoundedOutput();
		let timedOut = false;
		let settled = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, timeoutMs);
		const finish = (exitCode: number | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ exitCode, stdout: stdout.value(), stderr: stderr.value(), timedOut });
		};
		child.stdout.on("data", (chunk: Buffer | string) => stdout.append(chunk));
		child.stderr.on("data", (chunk: Buffer | string) => stderr.append(chunk));
		child.on("error", (error: NodeJS.ErrnoException) => finish(error.code === "ENOENT" ? 127 : null));
		child.on("close", (code) => finish(code));
		if (stdin !== undefined && child.stdin) {
			child.stdin.on("error", () => undefined);
			child.stdin.end(stdin, "utf8");
		}
	});
}

class BoundedOutput {
	#head = Buffer.alloc(0);
	#tail = Buffer.alloc(0);
	#full = Buffer.alloc(0);
	#total = 0;

	append(chunk: Buffer | string): void {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		this.#total += buffer.length;
		if (this.#full.length <= OUTPUT_EDGE_BYTES * 2) {
			this.#full = Buffer.concat([this.#full, buffer]).subarray(0, OUTPUT_EDGE_BYTES * 2);
		}
		if (this.#head.length < OUTPUT_EDGE_BYTES) {
			this.#head = Buffer.concat([this.#head, buffer]).subarray(0, OUTPUT_EDGE_BYTES);
		}
		this.#tail = Buffer.concat([this.#tail, buffer]);
		if (this.#tail.length > OUTPUT_EDGE_BYTES) {
			this.#tail = this.#tail.subarray(-OUTPUT_EDGE_BYTES);
		}
	}

	value(): string {
		if (this.#total <= OUTPUT_EDGE_BYTES * 2) return this.#full.toString("utf8");
		const omitted = this.#total - OUTPUT_EDGE_BYTES * 2;
		return `${this.#head.toString("utf8")}\n...[output truncated; omitted ${formatByteCount(omitted)}]...\n${this.#tail.toString("utf8")}`;
	}
}

export function truncateOutput(value: string): string {
	const buffer = Buffer.from(value, "utf8");
	if (buffer.length <= OUTPUT_EDGE_BYTES * 2) return value;
	const omitted = buffer.length - OUTPUT_EDGE_BYTES * 2;
	return `${buffer.subarray(0, OUTPUT_EDGE_BYTES).toString("utf8")}\n...[output truncated; omitted ${formatByteCount(omitted)}]...\n${buffer.subarray(-OUTPUT_EDGE_BYTES).toString("utf8")}`;
}

function formatByteCount(bytes: number): string {
	const units = ["bytes", "KiB", "MiB", "GiB"];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
	return `${formatted} ${units[unitIndex]}`;
}
