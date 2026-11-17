import { describe, expect, test } from "bun:test";
import { createMcpServer } from "./mcp";

describe("ssh MCP server", () => {
	test("exposes concise tools under one namespace", async () => {
		const server = createMcpServer({
			list: async () => ({ panes: [] }),
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
		expect(tools.map((t) => t.name)).toEqual(["list", "spawn", "exec", "wait", "download", "upload", "close"]);
	});

	test("validates ids, treats empty optional strings as omitted, allows newline cmd, and formats busy/interrupted states", async () => {
		const calls: string[] = [];
		const server = createMcpServer({
			list: async () => {
				calls.push("list");
				return {
					panes: [{
						id: "a1b2c3",
						host: "mac",
						status: "idle",
						cwd: "/tmp",
					}],
				};
			},
			spawn: async (input) => {
				calls.push(`spawn:${input.host}:${input.cwd ?? "-"}`);
				return { id: "a1b2c3", host: input.host, status: "idle", cwd: input.cwd ?? "/home/user" };
			},
			exec: async (input) => {
				calls.push(`exec:${input.id}:${JSON.stringify(input.cmd)}:${input.async ?? false}`);
				if (input.cmd === "ctrl-c") {
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
			params: { name: "exec", arguments: { id: "A1B2C3", cmd: "ls" } },
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

		const listRes = await server.handle({
			jsonrpc: "2.0",
			id: 7,
			method: "tools/call",
			params: { name: "list" },
		});
		expect((listRes?.result as { content: Array<{ text: string }> }).content[0].text).toBe("a1b2c3 mac idle /tmp");

		const waitRes = await server.handle({
			jsonrpc: "2.0",
			id: 8,
			method: "tools/call",
			params: { name: "wait", arguments: { id: "a1b2c3" } },
		});
		expect((waitRes?.result as { content: Array<{ text: string }> }).content[0].text)
			.toBe("status=busy fg=sudo tty=noecho stalled=true cwd=/tmp\nPassword:");

		const nlExec = await server.handle({
			jsonrpc: "2.0",
			id: 9,
			method: "tools/call",
			params: { name: "exec", arguments: { id: "a1b2c3", cmd: "\n" } },
		});
		expect((nlExec?.result as { structuredContent: { exit_code: number } }).structuredContent.exit_code).toBe(0);

		const intExec = await server.handle({
			jsonrpc: "2.0",
			id: 10,
			method: "tools/call",
			params: { name: "exec", arguments: { id: "a1b2c3", cmd: "ctrl-c" } },
		});
		expect((intExec?.result as { content: Array<{ text: string }> }).content[0].text).toBe("interrupted cwd=/tmp\n^C");

		const closeRes = await server.handle({
			jsonrpc: "2.0",
			id: 11,
			method: "tools/call",
			params: { name: "close", arguments: { id: "a1b2c3" } },
		});
		expect((closeRes?.result as { content: Array<{ text: string }> }).content[0].text).toBe("a1b2c3 closed");
		expect(calls).toEqual([
			"spawn:mac:-",
			"download:a1b2c3:f.txt:-",
			"list",
			"wait:a1b2c3",
			'exec:a1b2c3:"\\n":false',
			'exec:a1b2c3:"ctrl-c":false',
			"close:a1b2c3",
		]);
	});
});
