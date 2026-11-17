import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcessResult, ProcessRunner } from "./process";
import { PaneService, parseJobOutput } from "./service";

const tempRoots: string[] = [];

async function tempCache(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "agents-ssh-test-"));
	tempRoots.push(dir);
	return dir;
}

afterEach(async () => {
	while (tempRoots.length > 0) {
		const dir = tempRoots.pop()!;
		await rm(dir, { recursive: true, force: true });
	}
});

function createHerdrHarness(options: { remoteHerdrHosts?: string[]; waitMiss?: boolean } = {}) {
	let wsSeq = 1;
	let tabSeq = 1;
	let paneSeq = 1;
	const workspaces = new Map<string, { workspace_id: string; label: string; pane_count: number; tab_count: number }>();
	const tabs = new Map<string, { tab_id: string; workspace_id: string; label?: string }>();
	const panes = new Map<string, { pane_id: string; workspace_id: string; tab_id: string; cwd: string; title?: string; output: string; foreground: number }>();
	const herdrCalls: string[] = [];
	const sftpCalls: Array<{ args: string[]; stdin?: string }> = [];
	const sshCalls: Array<{ args: string[]; stdin?: string }> = [];
	const remoteHerdr = new Set(options.remoteHerdrHosts ?? []);
	let nextExecDelay = false;
	let remotePwd = "/home/user";
	let nextExitCode = 0;
	let waitMiss = options.waitMiss ?? false;

	const runner: ProcessRunner = async (command, args, _timeoutMs, stdin) => {
		if (command === "ssh") {
			sshCalls.push({ args, stdin });
			const dashIdx = args.indexOf("--");
			const host = dashIdx >= 0 ? args[dashIdx + 1] : "";
			const remoteCmd = dashIdx >= 0 ? args[dashIdx + 2] ?? "" : "";
			if (remoteCmd.startsWith("herdr ")) {
				if (!remoteHerdr.has(host)) {
					return { exitCode: 127, stdout: "", stderr: "herdr: command not found" };
				}
				return handleHerdr(remoteCmd);
			}
			if (remoteCmd.startsWith("cat > /tmp/apane_") || remoteCmd.startsWith("mkdir -p --")) {
				return { exitCode: 0, stdout: "", stderr: "" };
			}
			if (remoteCmd.startsWith("if [ -d ")) {
				return { exitCode: 0, stdout: "file", stderr: "" };
			}
			return { exitCode: 0, stdout: "", stderr: "" };
		}

		if (command === "sftp") {
			sftpCalls.push({ args, stdin });
			return { exitCode: 0, stdout: "", stderr: "" };
		}

		if (command === "herdr") {
			return handleHerdrArgs(args);
		}

		return { exitCode: 127, stdout: "", stderr: `unexpected command: ${command}` };
	};

	function handleHerdr(remoteCmd: string): ProcessResult {
		const rawArgs = remoteCmd
			.slice("herdr ".length)
			.match(/(?:'(?:[^']|'\\'')*'|[^\s])+/g)
			?.map((token) => (token.startsWith("'") && token.endsWith("'") ? token.slice(1, -1).replaceAll("'\\''", "'") : token)) ?? [];
		return handleHerdrArgs(rawArgs);
	}

	function handleHerdrArgs(args: string[]): ProcessResult {
		const [group, action, ...rest] = args;
		herdrCalls.push(`${group} ${action}`);
		if (group === "workspace" && action === "list") {
			return okJson({ workspaces: [...workspaces.values()] });
		}
		if (group === "workspace" && action === "create") {
			const labelIdx = rest.indexOf("--label");
			const label = labelIdx >= 0 ? rest[labelIdx + 1] : "agents-ssh";
			const wsId = `w${wsSeq++}`;
			const tabId = `${wsId}:t${tabSeq++}`;
			const paneId = `${wsId}:p${paneSeq++}`;
			workspaces.set(wsId, { workspace_id: wsId, label, pane_count: 1, tab_count: 1 });
			tabs.set(tabId, { tab_id: tabId, workspace_id: wsId, label: "1" });
			panes.set(paneId, { pane_id: paneId, workspace_id: wsId, tab_id: tabId, cwd: "/tmp", output: "", foreground: 0 });
			return okJson({ workspace: { workspace_id: wsId }, tab: { tab_id: tabId }, root_pane: { pane_id: paneId } });
		}
		if (group === "tab" && action === "create") {
			const wsIdx = rest.indexOf("--workspace");
			const wsId = wsIdx >= 0 ? rest[wsIdx + 1] : "";
			const ws = workspaces.get(wsId);
			if (!ws) return errJson("workspace_not_found", "workspace not found");
			const labelIdx = rest.indexOf("--label");
			const label = labelIdx >= 0 ? rest[labelIdx + 1] : undefined;
			const tabId = `${wsId}:t${tabSeq++}`;
			const paneId = `${wsId}:p${paneSeq++}`;
			ws.tab_count += 1;
			ws.pane_count += 1;
			tabs.set(tabId, { tab_id: tabId, workspace_id: wsId, label });
			panes.set(paneId, { pane_id: paneId, workspace_id: wsId, tab_id: tabId, cwd: "/tmp", output: "", foreground: 0 });
			return okJson({ tab: { tab_id: tabId, workspace_id: wsId }, root_pane: { pane_id: paneId } });
		}
		if (group === "tab" && action === "rename") {
			const tab = tabs.get(rest[0]);
			if (!tab) return errJson("tab_not_found", "tab not found");
			tab.label = rest.slice(1).join(" ");
			return { exitCode: 0, stdout: "{}", stderr: "" };
		}
		if (group === "pane" && action === "list") {
			const wsIdx = rest.indexOf("--workspace");
			const wsFilter = wsIdx >= 0 ? rest[wsIdx + 1] : undefined;
			const list = [...panes.values()]
				.filter((p) => !wsFilter || p.workspace_id === wsFilter)
				.map((p) => ({ pane_id: p.pane_id, workspace_id: p.workspace_id, tab_id: p.tab_id, cwd: p.cwd, terminal_title: p.title }));
			return okJson({ panes: list });
		}
		if (group === "pane" && action === "split") {
			throw new Error("pane split must not be used");
		}
		if (group === "pane" && action === "rename") {
			const pane = panes.get(rest[0]);
			if (!pane) return errJson("pane_not_found", "pane not found");
			pane.title = rest.slice(1).join(" ");
			return { exitCode: 0, stdout: "{}", stderr: "" };
		}
		if (group === "pane" && action === "run") {
			const pane = panes.get(rest[0]);
			if (!pane) return errJson("pane_not_found", "pane not found");
			const cmd = (rest[1] ?? "").replaceAll("'\\''", "'").replaceAll("'\\''", "'");
			const readyMatch = cmd.match(/READY_%s:(?:%d|0):%s[^']*' '([0-9a-f]{6})'/);
			if (readyMatch) {
				const hexId = readyMatch[1];
				const cdMatch = cmd.match(/cd -- '([^']+)'/);
				const cwd = cdMatch ? cdMatch[1] : remotePwd;
				if (cwd === "/missing") {
					pane.output += `\n__APANE_READY_${hexId}:1:/tmp__\n`;
				} else {
					remotePwd = cwd;
					pane.output += `\n__APANE_READY_${hexId}:0:${cwd}__\n`;
				}
				return { exitCode: 0, stdout: "{}", stderr: "" };
			}
			const startMatch = cmd.match(/START_%s[^']*' '([0-9a-f]{6})'/);
			if (startMatch) {
				const tok = startMatch[1];
				pane.output += `\n__APANE_START_${tok}__\nhello world\n`;
				if (!nextExecDelay) {
					pane.output += `__APANE_DONE_${tok}:${nextExitCode}:${remotePwd}__\n`;
				}
			}
			return { exitCode: 0, stdout: "{}", stderr: "" };
		}
		if (group === "pane" && action === "wait-output") {
			const pane = panes.get(rest[0]);
			if (!pane) return errJson("pane_not_found", "pane not found");
			const regexIdx = rest.indexOf("--regex");
			const re = new RegExp(rest[regexIdx + 1], "m");
			if (!waitMiss && re.test(pane.output)) return { exitCode: 0, stdout: "{}", stderr: "" };
			return { exitCode: 1, stdout: "", stderr: JSON.stringify({ error: { code: "timeout", message: "timed out" } }) };
		}
		if (group === "pane" && action === "read") {
			const pane = panes.get(rest[0]);
			if (!pane) return errJson("pane_not_found", "pane not found");
			return { exitCode: 0, stdout: pane.output, stderr: "" };
		}
		if (group === "pane" && action === "process-info") {
			const paneIdx = rest.indexOf("--pane");
			const pane = panes.get(rest[paneIdx + 1]);
			if (!pane) return errJson("pane_not_found", "pane not found");
			return okJson({
				process_info: {
					pane_id: pane.pane_id,
					shell_pid: 100,
					foreground_processes: pane.foreground > 0 ? [{ pid: 200, name: "sleep", cmdline: "sleep 60", cwd: pane.cwd }] : [],
				},
			});
		}
		if (group === "pane" && action === "close") {
			panes.delete(rest[0]);
			return { exitCode: 0, stdout: "{}", stderr: "" };
		}
		return { exitCode: 1, stdout: "", stderr: `unknown herdr call: ${args.join(" ")}` };
	}

	return {
		runner,
		workspaces,
		tabs,
		panes,
		herdrCalls,
		sftpCalls,
		sshCalls,
		setDelayNextExec(delay: boolean) {
			nextExecDelay = delay;
		},
		completeLastDelayedJob(paneId: string, cwd: string, exitCode = 0) {
			const pane = panes.get(paneId)!;
			const startMatches = [...pane.output.matchAll(/__APANE_START_([0-9a-f]{6})__/g)];
			const tok = startMatches.at(-1)?.[1];
			if (!tok) throw new Error("No delayed job token found in pane output");
			remotePwd = cwd;
			pane.output += `finished line\n__APANE_DONE_${tok}:${exitCode}:${cwd}__\n`;
		},
		setRemotePwd(pwd: string) {
			remotePwd = pwd;
		},
		setWaitMiss(miss: boolean) {
			waitMiss = miss;
		},
	};
}

function okJson(result: unknown): ProcessResult {
	return { exitCode: 0, stdout: JSON.stringify({ result }), stderr: "" };
}

function errJson(code: string, message: string): ProcessResult {
	return { exitCode: 1, stdout: "", stderr: JSON.stringify({ error: { code, message } }) };
}

describe("parseJobOutput", () => {
	test("extracts body, exit code, and cwd between markers", () => {
		const raw = [
			"prompt$ . /tmp/apane_abc123.sh",
			"__APANE_START_abc123__",
			"line 1",
			"line 2",
			"__APANE_DONE_abc123:2:/srv/app__",
			"prompt$",
		].join("\n");
		expect(parseJobOutput(raw, "abc123", "__APANE_START_abc123__")).toEqual({
			done: true,
			exitCode: 2,
			cwd: "/srv/app",
			output: "line 1\nline 2",
		});
	});
});

describe("PaneService", () => {
	test("spawns tabs in same workspace without splitting, tracks cwd, and resolves empty/trailing-slash paths", async () => {
		const cache = await tempCache();
		const harness = createHerdrHarness();
		let nowMs = 1_000_000;
		const downloadsDir = join(cache, "Downloads");
		const service = new PaneService({
			runner: harness.runner,
			env: { AGENTS_SSH_CACHE_DIR: cache, AGENTS_SSH_DOWNLOADS_DIR: downloadsDir },
			now: () => nowMs,
		});

		const p1 = await service.spawn({ host: "mac", cwd: "/Users/supercgor/repo" });
		const p2 = await service.spawn({ host: "mac", cwd: "" });
		expect(p1.id).toMatch(/^[0-9a-f]{6}$/);
		expect(p2.id).toMatch(/^[0-9a-f]{6}$/);
		expect(harness.workspaces.size).toBe(1);
		expect(harness.tabs.size).toBe(2);
		expect(harness.herdrCalls).not.toContain("pane split");
		expect(harness.herdrCalls).toContain("tab create");

		harness.setRemotePwd("/Users/supercgor/repo/sub");
		const execRes = await service.exec({ id: p1.id, cmd: "cd sub && echo hi" });
		expect(execRes).toEqual({
			id: p1.id,
			status: "idle",
			cwd: "/Users/supercgor/repo/sub",
			exit_code: 0,
			output: "hello world",
		});

		const dlDefault = await service.download({ id: p1.id, remote: "out.log", local: "" });
		expect(dlDefault.remote).toBe("/Users/supercgor/repo/sub/out.log");
		expect(dlDefault.local).toBe(join(downloadsDir, "out.log"));

		const dlDir = await service.download({ id: p1.id, remote: "out.log", local: `${join(cache, "dest")}/` });
		expect(dlDir.local).toBe(join(cache, "dest", "out.log"));

		const localFile = join(cache, "local.txt");
		await writeFile(localFile, "data");
		const ulDefault = await service.upload({ id: p1.id, local: localFile, remote: "" });
		expect(ulDefault.remote).toBe("/Users/supercgor/repo/sub/local.txt");

		const ulDir = await service.upload({ id: p1.id, local: localFile, remote: "nested/" });
		expect(ulDir.remote).toBe("/Users/supercgor/repo/sub/nested/local.txt");

		expect(await service.close({ id: p1.id })).toEqual({ id: p1.id, closed: true });
		expect(await service.close({ id: p2.id })).toEqual({ id: p2.id, closed: true });
		expect((await service.list()).panes).toHaveLength(0);
	});

	test("wait transitions busy -> idle cleanly even if async job already finished during reconcile", async () => {
		const cache = await tempCache();
		const harness = createHerdrHarness({ remoteHerdrHosts: ["judy"] });
		const service = new PaneService({
			runner: harness.runner,
			env: { AGENTS_SSH_CACHE_DIR: cache },
		});

		const spawned = await service.spawn({ host: "judy" });

		harness.setDelayNextExec(true);
		const busy = await service.exec({ id: spawned.id, cmd: "sleep 10", async: true });
		expect(busy).toEqual({ id: spawned.id, status: "busy", cwd: "/home/user" });

		await expect(service.exec({ id: spawned.id, cmd: "echo collide" })).rejects.toThrow("busy");

		const stillBusy = await service.wait({ id: spawned.id, timeout_ms: 50 });
		expect(stillBusy.status).toBe("busy");
		expect(stillBusy.output).toContain("hello world");

		harness.completeLastDelayedJob("w1:p1", "/tmp/done", 0);
		// Calling list() reconciles busy -> idle first, then wait() still returns exit_code & output.
		const listed = await service.list();
		expect(listed.panes).toEqual([{ id: spawned.id, host: "judy", status: "idle", cwd: "/tmp/done" }]);

		const completed = await service.wait({ id: spawned.id });
		expect(completed.status).toBe("idle");
		expect(completed.exit_code).toBe(0);
		expect(completed.cwd).toBe("/tmp/done");
		expect(completed.output).toContain("finished line");
	});

	test("awaitJob completes when buffer already contains DONE even if wait-output timed out", async () => {
		const cache = await tempCache();
		const harness = createHerdrHarness();
		const service = new PaneService({
			runner: harness.runner,
			env: { AGENTS_SSH_CACHE_DIR: cache },
		});

		const spawned = await service.spawn({ host: "local" });
		harness.setWaitMiss(true);
		const res = await service.exec({ id: spawned.id, cmd: "echo ok", timeout_ms: 50 });
		expect(res).toEqual({
			id: spawned.id,
			status: "idle",
			cwd: "/home/user",
			exit_code: 0,
			output: "hello world",
		});
	});

	test("lazy GC closes expired idle panes on next call while respecting ttl=0", async () => {
		const cache = await tempCache();
		const harness = createHerdrHarness();
		let nowMs = 1_000_000;
		const service = new PaneService({
			runner: harness.runner,
			env: { AGENTS_SSH_CACHE_DIR: cache, AGENTS_SSH_IDLE_TTL: "60" },
			now: () => nowMs,
		});

		await service.spawn({ host: "mac" });
		const pinned = await service.spawn({ host: "mac", ttl: 0 });
		expect(harness.panes.size).toBe(2);

		nowMs += 61_000;
		const listed = await service.list();
		expect(listed.panes.map((p) => p.id)).toEqual([pinned.id]);
		expect(harness.panes.size).toBe(1);
	});

	test("rolls back pane creation if initial cd fails", async () => {
		const cache = await tempCache();
		const harness = createHerdrHarness();
		const service = new PaneService({
			runner: harness.runner,
			env: { AGENTS_SSH_CACHE_DIR: cache },
		});

		await expect(service.spawn({ host: "mac", cwd: "/missing" })).rejects.toThrow("Failed to enter directory");
		expect(harness.panes.size).toBe(0);
	});
});
