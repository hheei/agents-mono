#!/usr/bin/env bun

import { optString, validateHexId, validateHost } from "./process";
import { type CloseResult, type GetResult, type PaneInfo, type PaneResult, PaneService } from "./service";
import type { TransferResult } from "./ssh";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
	jsonrpc: "2.0";
	id?: JsonRpcId;
	method?: string;
	params?: unknown;
}

interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: JsonRpcId;
	result?: unknown;
	error?: { code: number; message: string };
}

interface McpServerOptions {
	get?: (input: { id?: string; lines?: number }) => Promise<GetResult>;
	spawn?: (input: { host: string; cwd?: string; ttl?: number }) => Promise<PaneInfo>;
	send?: (input: { id: string; input: string; async?: boolean; timeout_ms?: number }) => Promise<PaneResult>;
	wait?: (input: { id: string; timeout_ms?: number; lines?: number }) => Promise<PaneResult>;
	download?: (input: { id: string; remote: string; local?: string }) => Promise<TransferResult>;
	upload?: (input: { id: string; local: string; remote?: string }) => Promise<TransferResult>;
	close?: (input: { id: string }) => Promise<CloseResult>;
}

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "ssh", version: "0.8.0" };

const TOOLS = [
	{
		name: "get",
		description: "List all panes, or inspect one pane's state, fg/tty, and recent output.",
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string", pattern: "^[0-9a-f]{6}$" },
				lines: { type: "integer", minimum: 1, maximum: 10000 },
			},
			required: [],
			additionalProperties: false,
		},
	},
	{
		name: "spawn",
		description: "Open a shell pane and return its 6-char lowercase hex id.",
		inputSchema: {
			type: "object",
			properties: {
				host: { type: "string", minLength: 1 },
				cwd: { type: "string" },
				ttl: { type: "integer", minimum: 0 },
			},
			required: ["host"],
			additionalProperties: false,
		},
	},
	{
		name: "send",
		description: "Run cmd in idle pane (sync wait or async), or send interactive text/keys (e.g. 'y\\n', 'ctrl-c') when busy.",
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string", pattern: "^[0-9a-f]{6}$" },
				input: { type: "string", minLength: 1 },
				async: { type: "boolean" },
				timeout_ms: { type: "integer", minimum: 1, maximum: 300000 },
			},
			required: ["id", "input"],
			additionalProperties: false,
		},
	},
	{
		name: "wait",
		description: "Wait for a busy pane to become idle.",
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string", pattern: "^[0-9a-f]{6}$" },
				timeout_ms: { type: "integer", minimum: 1, maximum: 300000 },
				lines: { type: "integer", minimum: 1, maximum: 10000 },
			},
			required: ["id"],
			additionalProperties: false,
		},
	},
	{
		name: "download",
		description: "SFTP download from pane (remote relative to pane cwd; local defaults to ~/Downloads).",
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string", pattern: "^[0-9a-f]{6}$" },
				remote: { type: "string", minLength: 1 },
				local: { type: "string" },
			},
			required: ["id", "remote"],
			additionalProperties: false,
		},
	},
	{
		name: "upload",
		description: "SFTP upload to pane (remote defaults/resolves to pane cwd).",
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string", pattern: "^[0-9a-f]{6}$" },
				local: { type: "string", minLength: 1 },
				remote: { type: "string" },
			},
			required: ["id", "local"],
			additionalProperties: false,
		},
	},
	{
		name: "close",
		description: "Close a pane.",
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string", pattern: "^[0-9a-f]{6}$" },
			},
			required: ["id"],
			additionalProperties: false,
		},
	},
];

export function createMcpServer(opts: McpServerOptions = {}) {
	const service = new PaneService();
	const ops = {
		get: opts.get ?? ((input) => service.get(input)),
		spawn: opts.spawn ?? ((input) => service.spawn(input)),
		send: opts.send ?? ((input) => service.send(input)),
		wait: opts.wait ?? ((input) => service.wait(input)),
		download: opts.download ?? ((input) => service.download(input)),
		upload: opts.upload ?? ((input) => service.upload(input)),
		close: opts.close ?? ((input) => service.close(input)),
	};

	return {
		async handle(msg: JsonRpcRequest): Promise<JsonRpcResponse | undefined> {
			const id = msg.id ?? null;
			switch (msg.method) {
				case "initialize":
					return ok(id, {
						protocolVersion: requestedProtocol(msg.params),
						serverInfo: SERVER_INFO,
						capabilities: { tools: {} },
					});
				case "notifications/initialized":
					return undefined;
				case "ping":
					return ok(id, {});
				case "tools/list":
					return ok(id, { tools: TOOLS });
				case "tools/call":
					return await callTool(id, msg.params, ops);
				default:
					return err(id, -32601, `Method not found: ${msg.method}`);
			}
		},
	};
}

async function callTool(
	id: JsonRpcId,
	params: unknown,
	ops: Required<McpServerOptions>,
): Promise<JsonRpcResponse> {
	if (!params || typeof params !== "object" || Array.isArray(params)) {
		return err(id, -32602, "tools/call params must be an object");
	}
	const { name, arguments: rawArgs } = params as { name?: unknown; arguments?: unknown };
	const args = rawArgs === undefined ? {} : rawArgs;
	if (!args || typeof args !== "object" || Array.isArray(args)) {
		return err(id, -32602, "arguments must be an object");
	}
	const a = args as Record<string, unknown>;

	switch (name) {
		case "get": {
			let paneId: string | undefined;
			try {
				paneId = optString(a.id, "get.id");
			} catch (e) {
				return err(id, -32602, e instanceof Error ? e.message : String(e));
			}
			if (paneId) {
				const idErr = checkPaneId(paneId, "get.id");
				if (idErr) return err(id, -32602, idErr);
			}
			if (a.lines !== undefined && (!Number.isInteger(a.lines) || (a.lines as number) < 1 || (a.lines as number) > 10000)) {
				return err(id, -32602, "get.lines must be between 1 and 10000");
			}
			if (Object.keys(a).some((k) => !["id", "lines"].includes(k))) {
				return err(id, -32602, "get received an unknown argument");
			}
			return await runOp(
				id,
				() => ops.get({ id: paneId, lines: a.lines as number | undefined }),
				formatGet,
			);
		}

		case "spawn": {
			if (typeof a.host !== "string") return err(id, -32602, "spawn.host must be a string");
			try {
				validateHost(a.host);
			} catch (e) {
				return err(id, -32602, e instanceof Error ? e.message : String(e));
			}
			let cwd: string | undefined;
			try {
				cwd = optString(a.cwd, "spawn.cwd");
			} catch (e) {
				return err(id, -32602, e instanceof Error ? e.message : String(e));
			}
			if (a.ttl !== undefined && (!Number.isInteger(a.ttl) || (a.ttl as number) < 0)) {
				return err(id, -32602, "spawn.ttl must be a non-negative integer");
			}
			if (Object.keys(a).some((k) => !["host", "cwd", "ttl"].includes(k))) {
				return err(id, -32602, "spawn received an unknown argument");
			}
			return await runOp(
				id,
				() => ops.spawn({ host: a.host as string, cwd, ttl: a.ttl as number | undefined }),
				formatSpawn,
			);
		}

		case "send": {
			const idErr = checkPaneId(a.id, "send.id");
			if (idErr) return err(id, -32602, idErr);
			if (typeof a.input !== "string" || a.input.length === 0 || a.input.includes("\0")) {
				return err(id, -32602, "send.input must be a non-empty string");
			}
			if (a.async !== undefined && typeof a.async !== "boolean") {
				return err(id, -32602, "send.async must be a boolean");
			}
			if (a.timeout_ms !== undefined && (!Number.isInteger(a.timeout_ms) || (a.timeout_ms as number) < 1 || (a.timeout_ms as number) > 300000)) {
				return err(id, -32602, "send.timeout_ms must be between 1 and 300000");
			}
			if (Object.keys(a).some((k) => !["id", "input", "async", "timeout_ms"].includes(k))) {
				return err(id, -32602, "send received an unknown argument");
			}
			return await runOp(
				id,
				() => ops.send(a as { id: string; input: string; async?: boolean; timeout_ms?: number }),
				formatPaneResult,
			);
		}

		case "wait": {
			const idErr = checkPaneId(a.id, "wait.id");
			if (idErr) return err(id, -32602, idErr);
			if (a.timeout_ms !== undefined && (!Number.isInteger(a.timeout_ms) || (a.timeout_ms as number) < 1 || (a.timeout_ms as number) > 300000)) {
				return err(id, -32602, "wait.timeout_ms must be between 1 and 300000");
			}
			if (a.lines !== undefined && (!Number.isInteger(a.lines) || (a.lines as number) < 1 || (a.lines as number) > 10000)) {
				return err(id, -32602, "wait.lines must be between 1 and 10000");
			}
			if (Object.keys(a).some((k) => !["id", "timeout_ms", "lines"].includes(k))) {
				return err(id, -32602, "wait received an unknown argument");
			}
			return await runOp(
				id,
				() => ops.wait(a as { id: string; timeout_ms?: number; lines?: number }),
				formatPaneResult,
			);
		}

		case "download": {
			const idErr = checkPaneId(a.id, "download.id");
			if (idErr) return err(id, -32602, idErr);
			if (typeof a.remote !== "string" || !a.remote.trim()) {
				return err(id, -32602, "download.remote must be a non-empty string");
			}
			let local: string | undefined;
			try {
				local = optString(a.local, "download.local");
			} catch (e) {
				return err(id, -32602, e instanceof Error ? e.message : String(e));
			}
			if (Object.keys(a).some((k) => !["id", "remote", "local"].includes(k))) {
				return err(id, -32602, "download received an unknown argument");
			}
			return await runOp(
				id,
				() => ops.download({ id: a.id as string, remote: a.remote as string, local }),
				(v) => v.local,
			);
		}

		case "upload": {
			const idErr = checkPaneId(a.id, "upload.id");
			if (idErr) return err(id, -32602, idErr);
			if (typeof a.local !== "string" || !a.local.trim()) {
				return err(id, -32602, "upload.local must be a non-empty string");
			}
			let remote: string | undefined;
			try {
				remote = optString(a.remote, "upload.remote");
			} catch (e) {
				return err(id, -32602, e instanceof Error ? e.message : String(e));
			}
			if (Object.keys(a).some((k) => !["id", "local", "remote"].includes(k))) {
				return err(id, -32602, "upload received an unknown argument");
			}
			return await runOp(
				id,
				() => ops.upload({ id: a.id as string, local: a.local as string, remote }),
				(v) => v.remote,
			);
		}

		case "close": {
			const idErr = checkPaneId(a.id, "close.id");
			if (idErr) return err(id, -32602, idErr);
			if (Object.keys(a).some((k) => k !== "id")) {
				return err(id, -32602, "close received an unknown argument");
			}
			return await runOp(
				id,
				() => ops.close(a as { id: string }),
				(v) => `${v.id} ${v.closed ? "closed" : "not_found"}`,
			);
		}

		default:
			return err(id, -32602, "Unknown tool");
	}
}

function checkPaneId(value: unknown, label: string): string | undefined {
	if (typeof value !== "string") return `${label} must be a 6-character lowercase hex string`;
	try {
		validateHexId(value);
		return undefined;
	} catch (e) {
		return e instanceof Error ? e.message : String(e);
	}
}

async function runOp<T>(id: JsonRpcId, op: () => Promise<T>, format: (v: T) => string): Promise<JsonRpcResponse> {
	try {
		const value = await op();
		return ok(id, { content: [{ type: "text", text: format(value) }], structuredContent: value });
	} catch (e) {
		return ok(id, {
			isError: true,
			content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
		});
	}
}

function formatGet(v: GetResult): string {
	if ("panes" in v) {
		if (v.panes.length === 0) return "none";
		return v.panes
			.map((p) => `${p.id} ${p.host} ${p.status} ${p.cwd}${p.fg ? ` fg=${p.fg}` : ""}`)
			.join("\n");
	}
	return formatPaneResult(v);
}

function formatSpawn(p: PaneInfo): string {
	return `${p.id} ${p.cwd}`;
}

function formatPaneResult(v: PaneResult): string {
	if (v.status === "busy") {
		const parts = ["status=busy"];
		if (v.fg) parts.push(`fg=${v.fg}`);
		if (v.tty) parts.push(`tty=${v.tty}`);
		if (v.stalled) parts.push("stalled=true");
		parts.push(`cwd=${v.cwd}`);
		const head = parts.join(" ");
		return v.output ? `${head}\n${v.output}` : head;
	}
	const head = v.interrupted
		? `interrupted cwd=${v.cwd}`
		: v.exit_code === undefined
			? `cwd=${v.cwd}`
			: `exit=${v.exit_code} cwd=${v.cwd}`;
	return v.output ? `${head}\n${v.output}` : head;
}

function requestedProtocol(params: unknown): string {
	if (!params || typeof params !== "object" || Array.isArray(params)) return PROTOCOL_VERSION;
	const ver = (params as Record<string, unknown>).protocolVersion;
	return typeof ver === "string" && ver.trim() ? ver : PROTOCOL_VERSION;
}

function ok(id: JsonRpcId, value: unknown): JsonRpcResponse {
	return { jsonrpc: "2.0", id, result: value };
}

function err(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
	return { jsonrpc: "2.0", id, error: { code, message } };
}

export async function runStdio(server = createMcpServer()): Promise<void> {
	process.stdin.setEncoding("utf8");
	let buf = "";
	for await (const chunk of process.stdin) {
		buf += chunk;
		let nl = buf.indexOf("\n");
		while (nl >= 0) {
			await handleLine(server, buf.slice(0, nl));
			buf = buf.slice(nl + 1);
			nl = buf.indexOf("\n");
		}
	}
	if (buf.trim()) await handleLine(server, buf);
}

async function handleLine(server: ReturnType<typeof createMcpServer>, line: string): Promise<void> {
	if (!line.trim()) return;
	let res: JsonRpcResponse | undefined;
	try {
		res = await server.handle(JSON.parse(line));
	} catch {
		res = err(null, -32700, "Parse error");
	}
	if (res) process.stdout.write(`${JSON.stringify(res)}\n`);
}

if (import.meta.main) {
	runStdio().catch((e) => {
		process.stderr.write(`${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
		process.exitCode = 1;
	});
}
