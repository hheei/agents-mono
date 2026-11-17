import { describe, expect, test } from "bun:test";
import { createMcpServer } from "./mcp";

describe("ssh MCP server", () => {
	test("exposes concise tools under one namespace", async () => {
		const server = createMcpServer({
			get: async () => ({ panes: [] }),
		});

		const init = await server.handle({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: { protocolVersion: "2025-06-18" },
		});
		expect(init?.result).toEqual({
			protocolVersion: "2025-06-18",
			serverInfo: { name: "ssh", version: "0.8.0" },
			capabilities: { tools: {} },
		});

		const listed = await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
		const tools = (listed?.result as { tools: Array<{ name: string }> }).tools;
		expect(tools.map((t) => t.name)).toEqual(["get", "spawn", "send", "wait", "download", "upload", "close"]);
	});

	test("validates ids, treats empty optional strings as omitted, supports get(all/id), and delegates send", async () => {
		const calls: string[] = [];
		const server = createMcpServer({
			get: async (input) => {
				calls.push(`get:${input.id ?? "*"}`);
				if (input.id) {
					return {
						id: input.id,
						host: "mac",
						status: "busy",
						cwd: "/tmp",
						fg: "sudo",
						tty: "noecho",
						output: "Password:",
					};
				}
				return {
					panes: [{
						id: "a1b2c3",
						host: "mac",
						status: "busy",
						cwd: "/tmp",
						fg: "sudo",
					}],
				};
			},
			spawn: async (input) => {
				calls.push(`spawn:${input.host}:${input.cwd ?? "-"}`);
				return { id: "a1b2c3", host: input.host, status: "idle", cwd: input.cwd ?? "/home/user" };
			},
			send: async (input) => {
				calls.push(`send:${input.id}:${JSON.stringify(input.input)}:${input.async ?? false}`);
				if (input.input === "ctrl-c") {
					return { id: input.id, status: "idle", cwd: "/tmp", interrupted: true, output: "^C" };
				}
				return { id: input.id, status: "idle", cwd: "/tmp", exit_code: 0, output: "ok" };
			},
			wait: async (input) => {
				calls.push(`wait:${input.id}`);
				return {
					id: input.id,
					status: "busy",
					cwd: "/tmp",
					fg: "sudo",
					tty: "noecho",
					stalled: true,
					output: "Password:",
				};
			},
			download: async (input) => {
				calls.push(`download:${input.id}:${input.remote}:${input.local ?? "-"}`);
				return { local: "/tmp/Downloads/f.txt", remote: "/tmp/f.txt", kind: "file" };
			},
			close: async (input) => {
				calls.push(`close:${input.id}`);
				return { id: input.id, closed: true };
			},
		});

		const invalidId = await server.handle({
			jsonrpc: "2.0",
			id: 3,
			method: "tools/call",
			params: { name: "send", arguments: { id: "A1B2C3", input: "ls" } },
		});
		expect(invalidId?.error?.code).toBe(-32602);

		const emptyHost = await server.handle({
			jsonrpc: "2.0",
			id: 4,
			method: "tools/call",
			params: { name: "spawn", arguments: { host: "" } },
		});
		expect(emptyHost?.error?.code).toBe(-32602);

		const spawnEmptyCwd = await server.handle({
			jsonrpc: "2.0",
			id: 5,
			method: "tools/call",
			params: { name: "spawn", arguments: { host: "mac", cwd: "" } },
		});
		expect((spawnEmptyCwd?.result as { content: Array<{ text: string }> }).content[0].text).toBe("a1b2c3 /home/user");

		const dlEmptyLocal = await server.handle({
			jsonrpc: "2.0",
			id: 6,
			method: "tools/call",
			params: { name: "download", arguments: { id: "a1b2c3", remote: "f.txt", local: "  " } },
		});
		expect((dlEmptyLocal?.result as { content: Array<{ text: string }> }).content[0].text).toBe("/tmp/Downloads/f.txt");

		const getAll = await server.handle({
			jsonrpc: "2.0",
			id: 7,
			method: "tools/call",
			params: { name: "get", arguments: { id: "" } },
		});
		expect((getAll?.result as { content: Array<{ text: string }> }).content[0].text).toBe("a1b2c3 mac busy /tmp fg=sudo");

		const getOne = await server.handle({
			jsonrpc: "2.0",
			id: 8,
			method: "tools/call",
			params: { name: "get", arguments: { id: "a1b2c3" } },
		});
		expect((getOne?.result as { content: Array<{ text: string }> }).content[0].text)
			.toBe("status=busy fg=sudo tty=noecho cwd=/tmp\nPassword:");

		const waitRes = await server.handle({
			jsonrpc: "2.0",
			id: 9,
			method: "tools/call",
			params: { name: "wait", arguments: { id: "a1b2c3" } },
		});
		expect((waitRes?.result as { content: Array<{ text: string }> }).content[0].text)
			.toBe("status=busy fg=sudo tty=noecho stalled=true cwd=/tmp\nPassword:");

		const nlSend = await server.handle({
			jsonrpc: "2.0",
			id: 10,
			method: "tools/call",
			params: { name: "send", arguments: { id: "a1b2c3", input: "\n" } },
		});
		expect((nlSend?.result as { structuredContent: { exit_code: number } }).structuredContent.exit_code).toBe(0);

		const intSend = await server.handle({
			jsonrpc: "2.0",
			id: 11,
			method: "tools/call",
			params: { name: "send", arguments: { id: "a1b2c3", input: "ctrl-c" } },
		});
		expect((intSend?.result as { content: Array<{ text: string }> }).content[0].text).toBe("interrupted cwd=/tmp\n^C");

		const closeRes = await server.handle({
			jsonrpc: "2.0",
			id: 12,
			method: "tools/call",
			params: { name: "close", arguments: { id: "a1b2c3" } },
		});
		expect((closeRes?.result as { content: Array<{ text: string }> }).content[0].text).toBe("a1b2c3 closed");
		expect(calls).toEqual([
			"spawn:mac:-",
			"download:a1b2c3:f.txt:-",
			"get:*",
			"get:a1b2c3",
			"wait:a1b2c3",
			'send:a1b2c3:"\\n":false',
			'send:a1b2c3:"ctrl-c":false',
			"close:a1b2c3",
		]);
	});
});
