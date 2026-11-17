#!/usr/bin/env bun

import { validateHexId, validateHost } from "./process";
import { type CloseResult, type ExecResult, PaneService, type PaneSummary } from "./service";
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
	list?: () => Promise<{ panes: PaneSummary[] }>;
	spawn?: (input: { host: string; cwd?: string; idle_ttl_sec?: number }) => Promise<PaneSummary>;
	exec?: (input: { id: string; command: string; async?: boolean; timeout_ms?: number }) => Promise<ExecResult>;
	wait?: (input: { id: string; timeout_ms?: number; lines?: number }) => Promise<ExecResult>;
	download?: (input: { id: string; remote_path: string; local_path?: string }) => Promise<TransferResult>;
	upload?: (input: { id: string; local_path: string; remote_path?: string }) => Promise<TransferResult>;
	close?: (input: { id: string }) => Promise<CloseResult>;
}

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "ssh", version: "0.8.0" };

const TOOLS = [
	{
		name: "list",
		description: "List active panes (id, host, status, cwd).",
		inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
	},
	{
		name: "spawn",
		description: "Open a shell pane and return its 6-char lowercase hex id.",
		inputSchema: {
			type: "object",
			properties: {
				host: { type: "string", minLength: 1 },
				cwd: { type: "string", minLength: 1 },
				idle_ttl_sec: { type: "integer", minimum: 0 },
			},
			required: ["host"],
			additionalProperties: false,
		},
	},
	{
		name: "exec",
		description: "Run a command in a pane (sync or async).",
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string", pattern: "^[0-9a-f]{6}$" },
				command: { type: "string", minLength: 1 },
				async: { type: "boolean" },
				timeout_ms: { type: "integer", minimum: 1, maximum: 300000 },
			},
			required: ["id", "command"],
			additionalProperties: false,
		},
	},
	{
		name: "wait",
		description: "Wait for a running command or read pane output.",
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
				remote_path: { type: "string", minLength: 1 },
				local_path: { type: "string", minLength: 1 },
			},
			required: ["id", "remote_path"],
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
				local_path: { type: "string", minLength: 1 },
				remote_path: { type: "string", minLength: 1 },
			},
			required: ["id", "local_path"],
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

export function createMcpServer(options: McpServerOptions = {}) {
	const service = new PaneService();
	const ops = {
		list: options.list ?? (() => service.list()),
		spawn: options.spawn ?? ((input) => service.spawn(input)),
		exec: options.exec ?? ((input) => service.exec(input)),
		wait: options.wait ?? ((input) => service.wait(input)),
		download: options.download ?? ((input) => service.download(input)),
		upload: options.upload ?? ((input) => service.upload(input)),
		close: options.close ?? ((input) => service.close(input)),
	};

	return {
		async handle(message: JsonRpcRequest): Promise<JsonRpcResponse | undefined> {
			const id = message.id ?? null;
			switch (message.method) {
				case "initialize":
					return result(id, {
						protocolVersion: requestedProtocolVersion(message.params),
						serverInfo: SERVER_INFO,
						capabilities: { tools: {} },
					});
				case "notifications/initialized":
					return undefined;
				case "ping":
					return result(id, {});
				case "tools/list":
					return result(id, { tools: TOOLS });
				case "tools/call":
					return await callTool(id, message.params, ops);
				default:
					return failure(id, -32601, `Method not found: ${message.method}`);
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
		return failure(id, -32602, "tools/call params must be an object");
	}
	const record = params as Record<string, unknown>;
	const name = record.name;
	if (typeof name !== "string") return failure(id, -32602, "Unknown tool");
	const rawArgs = record.arguments;
	if (name === "list" && rawArgs === undefined) {
		return await runOp(id, ops.list, formatList);
	}
	if (!rawArgs || typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
		return failure(id, -32602, `${name} arguments must be an object`);
	}
	const args = rawArgs as Record<string, unknown>;

	switch (name) {
		case "list":
			if (Object.keys(args).length > 0) return failure(id, -32602, "list takes no arguments");
			return await runOp(id, ops.list, formatList);

		case "spawn": {
			if (typeof args.host !== "string") return failure(id, -32602, "spawn.host must be a string");
			try {
				validateHost(args.host);
			} catch (error) {
				return failure(id, -32602, error instanceof Error ? error.message : String(error));
			}
			if (args.cwd !== undefined && (typeof args.cwd !== "string" || !args.cwd.trim())) {
				return failure(id, -32602, "spawn.cwd must be a non-empty string");
			}
			if (args.idle_ttl_sec !== undefined && (!Number.isInteger(args.idle_ttl_sec) || (args.idle_ttl_sec as number) < 0)) {
				return failure(id, -32602, "spawn.idle_ttl_sec must be a non-negative integer");
			}
			if (Object.keys(args).some((k) => !["host", "cwd", "idle_ttl_sec"].includes(k))) {
				return failure(id, -32602, "spawn received an unknown argument");
			}
			return await runOp(
				id,
				() => ops.spawn(args as { host: string; cwd?: string; idle_ttl_sec?: number }),
				formatPane,
			);
		}

		case "exec": {
			const err = validatePaneIdArg(args.id, "exec.id");
			if (err) return failure(id, -32602, err);
			if (typeof args.command !== "string" || args.command.length === 0 || args.command.includes("\0")) {
				return failure(id, -32602, "exec.command must be a non-empty string");
			}
			if (args.async !== undefined && typeof args.async !== "boolean") {
				return failure(id, -32602, "exec.async must be a boolean");
			}
			if (args.timeout_ms !== undefined && (!Number.isInteger(args.timeout_ms) || (args.timeout_ms as number) < 1 || (args.timeout_ms as number) > 300000)) {
				return failure(id, -32602, "exec.timeout_ms must be between 1 and 300000");
			}
			if (Object.keys(args).some((k) => !["id", "command", "async", "timeout_ms"].includes(k))) {
				return failure(id, -32602, "exec received an unknown argument");
			}
			return await runOp(
				id,
				() => ops.exec(args as { id: string; command: string; async?: boolean; timeout_ms?: number }),
				formatExec,
			);
		}

		case "wait": {
			const err = validatePaneIdArg(args.id, "wait.id");
			if (err) return failure(id, -32602, err);
			if (args.timeout_ms !== undefined && (!Number.isInteger(args.timeout_ms) || (args.timeout_ms as number) < 1 || (args.timeout_ms as number) > 300000)) {
				return failure(id, -32602, "wait.timeout_ms must be between 1 and 300000");
			}
			if (args.lines !== undefined && (!Number.isInteger(args.lines) || (args.lines as number) < 1 || (args.lines as number) > 10000)) {
				return failure(id, -32602, "wait.lines must be between 1 and 10000");
			}
			if (Object.keys(args).some((k) => !["id", "timeout_ms", "lines"].includes(k))) {
				return failure(id, -32602, "wait received an unknown argument");
			}
			return await runOp(
				id,
				() => ops.wait(args as { id: string; timeout_ms?: number; lines?: number }),
				formatExec,
			);
		}

		case "download": {
			const err = validatePaneIdArg(args.id, "download.id");
			if (err) return failure(id, -32602, err);
			if (typeof args.remote_path !== "string" || !args.remote_path.trim()) {
				return failure(id, -32602, "download.remote_path must be a non-empty string");
			}
			if (args.local_path !== undefined && (typeof args.local_path !== "string" || !args.local_path.trim())) {
				return failure(id, -32602, "download.local_path must be a non-empty string");
			}
			if (Object.keys(args).some((k) => !["id", "remote_path", "local_path"].includes(k))) {
				return failure(id, -32602, "download received an unknown argument");
			}
			return await runOp(
				id,
				() => ops.download(args as { id: string; remote_path: string; local_path?: string }),
				(v) => v.local_path,
			);
		}

		case "upload": {
			const err = validatePaneIdArg(args.id, "upload.id");
			if (err) return failure(id, -32602, err);
			if (typeof args.local_path !== "string" || !args.local_path.trim()) {
				return failure(id, -32602, "upload.local_path must be a non-empty string");
			}
			if (args.remote_path !== undefined && (typeof args.remote_path !== "string" || !args.remote_path.trim())) {
				return failure(id, -32602, "upload.remote_path must be a non-empty string");
			}
			if (Object.keys(args).some((k) => !["id", "local_path", "remote_path"].includes(k))) {
				return failure(id, -32602, "upload received an unknown argument");
			}
			return await runOp(
				id,
				() => ops.upload(args as { id: string; local_path: string; remote_path?: string }),
				(v) => v.remote_path,
			);
		}

		case "close": {
			const err = validatePaneIdArg(args.id, "close.id");
			if (err) return failure(id, -32602, err);
			if (Object.keys(args).some((k) => k !== "id")) {
				return failure(id, -32602, "close received an unknown argument");
			}
			return await runOp(
				id,
				() => ops.close(args as { id: string }),
				(v) => `${v.id} ${v.closed ? "closed" : "not_found"}`,
			);
		}

		default:
			return failure(id, -32602, "Unknown tool");
	}
}

function validatePaneIdArg(value: unknown, label: string): string | undefined {
	if (typeof value !== "string") return `${label} must be a 6-character lowercase hex string`;
	try {
		validateHexId(value);
		return undefined;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

async function runOp<T>(id: JsonRpcId, op: () => Promise<T>, format: (v: T) => string): Promise<JsonRpcResponse> {
	try {
		const value = await op();
		return result(id, { content: [{ type: "text", text: format(value) }], structuredContent: value });
	} catch (error) {
		return result(id, {
			isError: true,
			content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
		});
	}
}

function formatList(v: { panes: PaneSummary[] }): string {
	if (v.panes.length === 0) return "none";
	return v.panes
		.map((p) => `${p.id} ${p.host} ${p.status} ${p.cwd}${p.job_id ? ` ${p.job_id}` : ""}`)
		.join("\n");
}

function formatPane(p: PaneSummary): string {
	return `${p.id} ${p.cwd}`;
}

function formatExec(v: ExecResult): string {
	if (v.status === "running") {
		const head = `status=running job=${v.job_id} cwd=${v.cwd}`;
		return v.output_tail ? `${head}\n${v.output_tail}` : head;
	}
	const head = v.exit_code === undefined
		? `cwd=${v.cwd}`
		: `exit=${v.exit_code} cwd=${v.cwd}`;
	return v.output ? `${head}\n${v.output}` : head;
}

function requestedProtocolVersion(params: unknown): string {
	if (!params || typeof params !== "object" || Array.isArray(params)) return PROTOCOL_VERSION;
	const version = (params as Record<string, unknown>).protocolVersion;
	return typeof version === "string" && version.trim() ? version : PROTOCOL_VERSION;
}

function result(id: JsonRpcId, value: unknown): JsonRpcResponse {
	return { jsonrpc: "2.0", id, result: value };
}

function failure(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
	return { jsonrpc: "2.0", id, error: { code, message } };
}

export async function runStdio(server = createMcpServer()): Promise<void> {
	process.stdin.setEncoding("utf8");
	let buffer = "";
	for await (const chunk of process.stdin) {
		buffer += chunk;
		let newline = buffer.indexOf("\n");
		while (newline >= 0) {
			await handleLine(server, buffer.slice(0, newline));
			buffer = buffer.slice(newline + 1);
			newline = buffer.indexOf("\n");
		}
	}
	if (buffer.trim()) await handleLine(server, buffer);
}

async function handleLine(server: ReturnType<typeof createMcpServer>, line: string): Promise<void> {
	if (!line.trim()) return;
	let response: JsonRpcResponse | undefined;
	try {
		response = await server.handle(JSON.parse(line));
	} catch {
		response = failure(null, -32700, "Parse error");
	}
	if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
}

if (import.meta.main) {
	runStdio().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
		process.exitCode = 1;
	});
}
