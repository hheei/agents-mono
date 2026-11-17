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

	test("validates 6-char hex pane ids and delegates tool calls", async () => {
		const calls: string[] = [];
		const server = createMcpServer({
			list: async () => {
				calls.push("list");
				return {
					panes: [{
						id: "a1b2c3",
						host: "mac",
						mode: "local-herdr-ssh",
						herdr_pane_id: "w1:p1",
						status: "idle",
						cwd: "/tmp",
						idle_ttl_sec: 1800,
						last_used_at: "2026-11-17T00:00:00.000Z",
					}],
				};
			},
			exec: async (input) => {
				calls.push(`exec:${input.id}:${input.async ?? false}`);
				return { id: input.id, status: "done", cwd: "/tmp", exit_code: 0, output: "ok" };
			},
			close: async (input) => {
				calls.push(`close:${input.id}`);
				return { id: input.id, closed: true };
			},
		});

		const invalid = await server.handle({
			jsonrpc: "2.0",
			id: 3,
			method: "tools/call",
			params: { name: "exec", arguments: { id: "bad", command: "ls" } },
		});
		expect(invalid?.error?.code).toBe(-32602);

		const listRes = await server.handle({
			jsonrpc: "2.0",
			id: 4,
			method: "tools/call",
			params: { name: "list" },
		});
		expect((listRes?.result as { content: Array<{ text: string }> }).content[0].text).toContain("a1b2c3");

		const execRes = await server.handle({
			jsonrpc: "2.0",
			id: 5,
			method: "tools/call",
			params: { name: "exec", arguments: { id: "a1b2c3", command: "ls", async: false } },
		});
		expect((execRes?.result as { structuredContent: { exit_code: number } }).structuredContent.exit_code).toBe(0);

		const closeRes = await server.handle({
			jsonrpc: "2.0",
			id: 6,
			method: "tools/call",
			params: { name: "close", arguments: { id: "a1b2c3" } },
		});
		expect((closeRes?.result as { content: Array<{ text: string }> }).content[0].text).toBe("a1b2c3: closed");
		expect(calls).toEqual(["list", "exec:a1b2c3:false", "close:a1b2c3"]);
	});
});
