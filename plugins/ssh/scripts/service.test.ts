import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

function createHerdrHarness(options: { remoteHerdrHosts?: string[] } = {}) {
	let workspaceSeq = 1;
	let paneSeq = 1;
	const workspaces = new Map<string, { workspace_id: string; label: string; pane_count: number; tab_count: number }>();
	const panes = new Map<string, { pane_id: string; workspace_id: string; tab_id: string; cwd: string; title?: string; output: string; foreground: number }>();
	const sftpCalls: Array<{ args: string[]; stdin?: string }> = [];
	const sshCalls: Array<{ args: string[]; stdin?: string }> = [];
	const remoteHerdr = new Set(options.remoteHerdrHosts ?? []);
	let nextExecDelay = false;
	let remotePwd = "/home/user";
	let nextExitCode = 0;

	const runner: ProcessRunner = async (command, args, _timeoutMs, stdin) => {
		if (command === "ssh") {
			sshCalls.push({ args, stdin });
			const dashIndex = args.indexOf("--");
			const host = dashIndex >= 0 ? args[dashIndex + 1] : "";
			const remoteCmd = dashIndex >= 0 ? args[dashIndex + 2] ?? "" : "";
			if (remoteCmd.startsWith("herdr ")) {
				if (!remoteHerdr.has(host)) {
					return { exitCode: 127, stdout: "", stderr: "herdr: command not found" };
				}
				return handleHerdr(remoteCmd);
			}
			if (remoteCmd.startsWith("cat > /tmp/apane_")) {
				return { exitCode: 0, stdout: "", stderr: "" };
			}
			if (remoteCmd.startsWith("mkdir -p --")) {
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
		if (group === "workspace" && action === "list") {
			return okJson({ workspaces: [...workspaces.values()] });
		}
		if (group === "workspace" && action === "create") {
			const labelIdx = rest.indexOf("--label");
			const label = labelIdx >= 0 ? rest[labelIdx + 1] : "agents-ssh";
			const wsId = `w${workspaceSeq++}`;
			const paneId = `${wsId}:p${paneSeq++}`;
			workspaces.set(wsId, { workspace_id: wsId, label, pane_count: 1, tab_count: 1 });
			panes.set(paneId, { pane_id: paneId, workspace_id: wsId, tab_id: `${wsId}:t1`, cwd: "/tmp", output: "", foreground: 0 });
			return okJson({ workspace: { workspace_id: wsId }, tab: { tab_id: `${wsId}:t1` }, root_pane: { pane_id: paneId } });
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
			const anchor = panes.get(rest[0]);
			if (!anchor) return errJson("pane_not_found", "pane not found");
			const paneId = `${anchor.workspace_id}:p${paneSeq++}`;
			panes.set(paneId, { pane_id: paneId, workspace_id: anchor.workspace_id, tab_id: anchor.tab_id, cwd: anchor.cwd, output: "", foreground: 0 });
			const ws = workspaces.get(anchor.workspace_id)!;
			ws.pane_count += 1;
			return okJson({ pane: { pane_id: paneId, workspace_id: anchor.workspace_id } });
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
				const jobId = startMatch[1];
				pane.output += `\n__APANE_START_${jobId}__\nhello world\n`;
				if (!nextExecDelay) {
					pane.output += `__APANE_DONE_${jobId}:${nextExitCode}:${remotePwd}__\n`;
				}
			}
			return { exitCode: 0, stdout: "{}", stderr: "" };
		}
		if (group === "pane" && action === "wait-output") {
			const pane = panes.get(rest[0]);
			if (!pane) return errJson("pane_not_found", "pane not found");
			const regexIdx = rest.indexOf("--regex");
			const re = new RegExp(rest[regexIdx + 1], "m");
			if (re.test(pane.output)) return { exitCode: 0, stdout: "{}", stderr: "" };
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
		panes,
		sftpCalls,
		sshCalls,
		setDelayNextExec(delay: boolean) {
			nextExecDelay = delay;
		},
		completeDelayedJob(paneId: string, jobId: string, cwd: string, exitCode = 0) {
			const pane = panes.get(paneId)!;
			remotePwd = cwd;
			pane.output += `finished line\n__APANE_DONE_${jobId}:${exitCode}:${cwd}__\n`;
		},
		setRemotePwd(pwd: string) {
			remotePwd = pwd;
		},
		setNextExitCode(code: number) {
			nextExitCode = code;
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
		expect(parseJobOutput(raw, "abc123", "__APANE_START_abc123__", "__APANE_DONE_abc123:")).toEqual({
			done: true,
			exitCode: 2,
			cwd: "/srv/app",
			output: "line 1\nline 2",
		});
	});
});

describe("PaneService", () => {
	test("spawns 6-char hex pane, tracks cwd across exec, downloads/uploads relative to cwd, and closes", async () => {
		const cache = await tempCache();
		const harness = createHerdrHarness();
		let nowMs = 1_000_000;
		const downloadsDir = join(cache, "Downloads");
		const service = new PaneService({
			runner: harness.runner,
			environment: { AGENTS_SSH_CACHE_DIR: cache, AGENTS_SSH_DOWNLOADS_DIR: downloadsDir },
			now: () => nowMs,
		});

		const spawned = await service.spawn({ host: "mac", cwd: "/Users/supercgor/repo" });
		expect(spawned.id).toMatch(/^[0-9a-f]{6}$/);
		expect(spawned.cwd).toBe("/Users/supercgor/repo");

		harness.setRemotePwd("/Users/supercgor/repo/sub");
		const execRes = await service.exec({ id: spawned.id, command: "cd sub && echo hi" });
		expect(execRes.status).toBe("done");
		expect(execRes.exit_code).toBe(0);
		expect(execRes.cwd).toBe("/Users/supercgor/repo/sub");
		expect(execRes.output).toBe("hello world");

		const dl = await service.download({ id: spawned.id, remote_path: "out.log" });
		expect(dl.remote_path).toBe("/Users/supercgor/repo/sub/out.log");
		expect(dl.local_path).toBe(join(downloadsDir, "out.log"));
		expect(harness.sftpCalls[0]?.stdin).toContain('"/Users/supercgor/repo/sub/out.log"');

		const localFile = join(cache, "local.txt");
		await writeFile(localFile, "data");
		const ul = await service.upload({ id: spawned.id, local_path: localFile, remote_path: "dest/local.txt" });
		expect(ul.remote_path).toBe("/Users/supercgor/repo/sub/dest/local.txt");

		const listed = await service.list();
		expect(listed.panes).toHaveLength(1);
		expect(listed.panes[0].cwd).toBe("/Users/supercgor/repo/sub");

		expect(await service.close({ id: spawned.id })).toEqual({ id: spawned.id, closed: true });
		expect((await service.list()).panes).toHaveLength(0);
	});

	test("supports async exec and wait completion, and blocks concurrent exec while running", async () => {
		const cache = await tempCache();
		const harness = createHerdrHarness({ remoteHerdrHosts: ["judy"] });
		const service = new PaneService({
			runner: harness.runner,
			environment: { AGENTS_SSH_CACHE_DIR: cache },
		});

		const spawned = await service.spawn({ host: "judy" });

		harness.setDelayNextExec(true);
		const running = await service.exec({ id: spawned.id, command: "sleep 10", async: true });
		expect(running.status).toBe("running");
		expect(running.job_id).toMatch(/^[0-9a-f]{6}$/);

		await expect(service.exec({ id: spawned.id, command: "echo collide" })).rejects.toThrow("busy");

		const stillRunning = await service.wait({ id: spawned.id, timeout_ms: 50 });
		expect(stillRunning.status).toBe("running");
		expect(stillRunning.output_tail).toContain("hello world");

		harness.completeDelayedJob("w1:p1", running.job_id!, "/tmp/done", 0);
		const completed = await service.wait({ id: spawned.id });
		expect(completed.status).toBe("done");
		expect(completed.exit_code).toBe(0);
		expect(completed.cwd).toBe("/tmp/done");
		expect(completed.output).toContain("finished line");
	});

	test("lazy GC closes expired idle panes on next call while respecting idle_ttl_sec=0", async () => {
		const cache = await tempCache();
		const harness = createHerdrHarness();
		let nowMs = 1_000_000;
		const service = new PaneService({
			runner: harness.runner,
			environment: { AGENTS_SSH_CACHE_DIR: cache, AGENTS_SSH_IDLE_TTL: "60" },
			now: () => nowMs,
		});

		const ephemeral = await service.spawn({ host: "mac" });
		const pinned = await service.spawn({ host: "mac", idle_ttl_sec: 0 });
		expect(harness.panes.size).toBe(2);

		nowMs += 61_000;
		const listed = await service.list();
		expect(listed.panes.map((p) => p.id)).toEqual([pinned.id]);
		expect(harness.panes.size).toBe(1);
		expect(harness.panes.has(ephemeral.herdr_pane_id)).toBe(false);
	});

	test("rolls back pane creation if initial cd fails", async () => {
		const cache = await tempCache();
		const harness = createHerdrHarness();
		const service = new PaneService({
			runner: harness.runner,
			environment: { AGENTS_SSH_CACHE_DIR: cache },
		});

		await expect(service.spawn({ host: "mac", cwd: "/missing" })).rejects.toThrow("Failed to enter directory");
		expect(harness.panes.size).toBe(0);
	});
});
