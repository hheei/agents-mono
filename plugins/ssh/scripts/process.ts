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

const KEY_ALIASES: Record<string, string> = {
	esc: "esc",
	escape: "esc",
	enter: "enter",
	return: "enter",
	tab: "tab",
	backspace: "backspace",
	up: "up",
	down: "down",
	left: "left",
	right: "right",
	space: "space",
};

const CTRL_ONLY_KEYS = new Set(["esc"]);

export function parseKeyToken(raw: string): string | undefined {
	if (/[\0\r\n]/.test(raw)) return undefined;
	const token = raw.trim().toLowerCase();
	if (!token) return undefined;
	if (token in KEY_ALIASES) return KEY_ALIASES[token];
	const ctrlMatch = token.match(/^(?:ctrl[-+]|\^)([a-z\\])$/);
	if (ctrlMatch) return `ctrl+${ctrlMatch[1]}`;
	return undefined;
}

export function isControlKey(key: string): boolean {
	return key.startsWith("ctrl+") || CTRL_ONLY_KEYS.has(key);
}

export function isInterruptKey(key: string): boolean {
	return key === "ctrl+c" || key === "ctrl+\\" || key === "ctrl+d";
}

export function validateHost(raw: string): string {
	const host = raw.trim();
	if (host === "") throw new Error("host must be a non-empty string");
	if (host.startsWith("-")) throw new Error("host must not start with '-'");
	if (/[\0\r\n\t ]/.test(host)) throw new Error("host must not contain whitespace");
	if (/[\/:]/.test(host)) throw new Error("host must not contain '/' or ':'; use an OpenSSH alias or 'local'");
	return host;
}

export function validateHexId(raw: string): string {
	const id = raw.trim();
	if (!/^[0-9a-f]{6}$/.test(id)) {
		throw new Error("id must be a 6-character lowercase hex pane id");
	}
	return id;
}

export function optString(raw: unknown, label: string): string | undefined {
	if (raw === undefined) return undefined;
	if (typeof raw !== "string") throw new Error(`${label} must be a string`);
	const trimmed = raw.trim();
	return trimmed === "" ? undefined : trimmed;
}

export function reqString(raw: unknown, label: string): string {
	if (typeof raw !== "string" || raw.trim() === "") {
		throw new Error(`${label} must be a non-empty string`);
	}
	return raw.trim();
}

export function assertNoControlChars(value: string, label: string): string {
	if (/[\0\r\n]/.test(value)) {
		throw new Error(`${label} must not contain NUL, CR, or LF`);
	}
	return value;
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
		const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		this.#total += buf.length;
		if (this.#full.length <= OUTPUT_EDGE_BYTES * 2) {
			this.#full = Buffer.concat([this.#full, buf]).subarray(0, OUTPUT_EDGE_BYTES * 2);
		}
		if (this.#head.length < OUTPUT_EDGE_BYTES) {
			this.#head = Buffer.concat([this.#head, buf]).subarray(0, OUTPUT_EDGE_BYTES);
		}
		this.#tail = Buffer.concat([this.#tail, buf]);
		if (this.#tail.length > OUTPUT_EDGE_BYTES) {
			this.#tail = this.#tail.subarray(-OUTPUT_EDGE_BYTES);
		}
	}

	value(): string {
		if (this.#total <= OUTPUT_EDGE_BYTES * 2) return this.#full.toString("utf8");
		const omitted = this.#total - OUTPUT_EDGE_BYTES * 2;
		return `${this.#head.toString("utf8")}\n...[output truncated; omitted ${formatBytes(omitted)}]...\n${this.#tail.toString("utf8")}`;
	}
}

export function truncateOutput(value: string): string {
	const buf = Buffer.from(value, "utf8");
	if (buf.length <= OUTPUT_EDGE_BYTES * 2) return value;
	const omitted = buf.length - OUTPUT_EDGE_BYTES * 2;
	return `${buf.subarray(0, OUTPUT_EDGE_BYTES).toString("utf8")}\n...[output truncated; omitted ${formatBytes(omitted)}]...\n${buf.subarray(-OUTPUT_EDGE_BYTES).toString("utf8")}`;
}

function formatBytes(bytes: number): string {
	const units = ["bytes", "KiB", "MiB", "GiB"];
	let val = bytes;
	let idx = 0;
	while (val >= 1024 && idx < units.length - 1) {
		val /= 1024;
		idx += 1;
	}
	const formatted = Number.isInteger(val) ? String(val) : val.toFixed(1).replace(/\.0$/, "");
	return `${formatted} ${units[idx]}`;
}
