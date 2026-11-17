#!/usr/bin/env bun

import { assertNoControlChars, optBool, optInt, optString, reqString, validateHexId, validateHost } from "./process";
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
	spawn?: (input: { host?: string; cwd?: string; ttl?: number }) => Promise<PaneInfo>;
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
		description: "Open a shell pane (host defaults to 'local', or pass an SSH alias).",
		inputSchema: {
			type: "object",
			properties: {
				host: { type: "string", minLength: 1 },
				cwd: { type: "string" },
				ttl: { type: "integer", minimum: 0 },
			},
			required: [],
			additionalProperties: false,
		},
	},
	{
		name: "send",
		description: "Run command when idle, or send input/keys (e.g. 'y\\n', 'ctrl-c') when busy.",
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
		description: "SFTP download from a remote pane (remote relative to pane cwd; local defaults to ~/Downloads).",
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
		description: "SFTP upload to a remote pane (remote defaults to pane cwd).",
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

	try {
		switch (name) {
			case "get": {
				assertKnownKeys(a, ["id", "lines"], "get");
				const rawId = optString(a.id, "get.id");
				const paneId = rawId ? validateHexId(rawId) : undefined;
				const lines = optInt(a.lines, "get.lines", 1, 10000);
				return await runOp(id, () => ops.get({ id: paneId, lines }), formatGet);
			}

			case "spawn": {
				assertKnownKeys(a, ["host", "cwd", "ttl"], "spawn");
				const host = a.host === undefined || a.host === null ? "local" : validateHost(reqString(a.host, "spawn.host"));
				const cwd = optString(a.cwd, "spawn.cwd");
				if (cwd) assertNoControlChars(cwd, "spawn.cwd");
				const ttl = optInt(a.ttl, "spawn.ttl", 0);
				return await runOp(id, () => ops.spawn({ host, cwd, ttl }), formatSpawn);
			}

			case "send": {
				assertKnownKeys(a, ["id", "input", "async", "timeout_ms"], "send");
				const paneId = validateHexId(reqString(a.id, "send.id"));
				if (typeof a.input !== "string" || a.input.length === 0 || a.input.includes("\0")) {
					return err(id, -32602, "send.input must be a non-empty string");
				}
				const runAsync = optBool(a.async, "send.async");
				const timeoutMs = optInt(a.timeout_ms, "send.timeout_ms", 1, 300000);
				return await runOp(
					id,
					() => ops.send({ id: paneId, input: a.input as string, async: runAsync, timeout_ms: timeoutMs }),
					formatPaneResult,
				);
			}

			case "wait": {
				assertKnownKeys(a, ["id", "timeout_ms", "lines"], "wait");
				const paneId = validateHexId(reqString(a.id, "wait.id"));
				const timeoutMs = optInt(a.timeout_ms, "wait.timeout_ms", 1, 300000);
				const lines = optInt(a.lines, "wait.lines", 1, 10000);
				return await runOp(id, () => ops.wait({ id: paneId, timeout_ms: timeoutMs, lines }), formatPaneResult);
			}

			case "download": {
				assertKnownKeys(a, ["id", "remote", "local"], "download");
				const paneId = validateHexId(reqString(a.id, "download.id"));
				const remote = assertNoControlChars(reqString(a.remote, "download.remote"), "download.remote");
				const local = optString(a.local, "download.local");
				if (local) assertNoControlChars(local, "download.local");
				return await runOp(id, () => ops.download({ id: paneId, remote, local }), (v) => v.local);
			}

			case "upload": {
				assertKnownKeys(a, ["id", "local", "remote"], "upload");
				const paneId = validateHexId(reqString(a.id, "upload.id"));
				const local = assertNoControlChars(reqString(a.local, "upload.local"), "upload.local");
				const remote = optString(a.remote, "upload.remote");
				if (remote) assertNoControlChars(remote, "upload.remote");
				return await runOp(id, () => ops.upload({ id: paneId, local, remote }), (v) => v.remote);
			}

			case "close": {
				assertKnownKeys(a, ["id"], "close");
				const paneId = validateHexId(reqString(a.id, "close.id"));
				return await runOp(id, () => ops.close({ id: paneId }), (v) => `${v.id} ${v.closed ? "closed" : "not_found"}`);
			}

			default:
				return err(id, -32602, "Unknown tool");
		}
	} catch (e) {
		return err(id, -32602, e instanceof Error ? e.message : String(e));
	}
}

function assertKnownKeys(args: Record<string, unknown>, allowed: string[], tool: string): void {
	if (Object.keys(args).some((k) => !allowed.includes(k))) {
		throw new Error(`${tool} received an unknown argument`);
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
