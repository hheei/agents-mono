import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseKeyToken, type ProcessResult, type ProcessRunner } from "./process";
import { PaneService, parseJobOutput } from "./service";
import { parseSttyMode } from "./ssh";

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
	let wsSeq = 1;
	let tabSeq = 1;
	let paneSeq = 1;
	const workspaces = new Map<string, { workspace_id: string; label: string; pane_count: number; tab_count: number }>();
	const tabs = new Map<string, { tab_id: string; workspace_id: string; label?: string }>();
	const panes = new Map<string, {
		pane_id: string;
		workspace_id: string;
		tab_id: string;
		cwd: string;
		title?: string;
		output: string;
		revision: number;
		shellPid: number;
		fg?: { name: string; pid: number };
		stty?: string;
	}>();
	const herdrCalls: string[] = [];
	const sentKeys: Array<{ paneId: string; keys: string[] }> = [];
	const sentTexts: Array<{ paneId: string; text: string }> = [];
	const sftpCalls: Array<{ args: string[]; stdin?: string }> = [];
	const sshCalls: Array<{ args: string[]; stdin?: string }> = [];
	const remoteHerdr = new Set(options.remoteHerdrHosts ?? []);
	let nextExecDelay = false;
	let remotePwd = "/home/user";
	let nextExitCode = 0;
	let waitMiss = false;
	let nextSilent = false;
	let onWaitAppend: string | undefined;

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
			if (remoteCmd.startsWith("ps -o pid=,tpgid=,comm=")) {
				const pane = [...panes.values()][0];
				const fg = pane?.fg;
				const shellPid = pane?.shellPid ?? 400;
				const tpgid = fg ? fg.pid : shellPid;
				const psLines = fg
					? `${shellPid} ${tpgid} /bin/zsh\n${fg.pid} ${tpgid} ${fg.name}`
					: `${shellPid} ${tpgid} /bin/zsh`;
				const stty = pane?.stty ?? "lflags: icanon isig echo";
				return { exitCode: 0, stdout: `${psLines}\n---STTY---\n${stty}\n---EC:0---\n`, stderr: "" };
			}
			if (remoteCmd.startsWith("stty -a")) {
				const pane = [...panes.values()][0];
				return { exitCode: 0, stdout: pane?.stty ?? "lflags: icanon isig echo", stderr: "" };
			}
			if (remoteCmd.startsWith("cat > /tmp/apane_") || remoteCmd.startsWith("mkdir -p --")) {
				return { exitCode: 0, stdout: "", stderr: "" };
			}
			if (remoteCmd === 'printf %s "$HOME"') {
				return { exitCode: 0, stdout: "/home/remote", stderr: "" };
			}
			if (remoteCmd.startsWith("if [ -d ")) {
				return { exitCode: 0, stdout: "file", stderr: "" };
			}
			return { exitCode: 0, stdout: "", stderr: "" };
		}

		if (command === "sh" && args[0] === "-c" && args[1]?.startsWith("stty -a")) {
			const pane = [...panes.values()][0];
			return { exitCode: 0, stdout: pane?.stty ?? "speed 38400 baud; icanon echo", stderr: "" };
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
			panes.set(paneId, {
				pane_id: paneId,
				workspace_id: wsId,
				tab_id: tabId,
				cwd: "/tmp",
				output: "",
				revision: 1,
				shellPid: 100 + paneSeq,
			});
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
			panes.set(paneId, {
				pane_id: paneId,
				workspace_id: wsId,
				tab_id: tabId,
				cwd: "/tmp",
				output: "",
				revision: 1,
				shellPid: 100 + paneSeq,
			});
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
				.map((p) => ({ pane_id: p.pane_id, workspace_id: p.workspace_id, tab_id: p.tab_id, cwd: p.cwd, terminal_title: p.title, revision: p.revision }));
			return okJson({ panes: list });
		}
		if (group === "pane" && action === "get") {
			const pane = panes.get(rest[0]);
			if (!pane) return errJson("pane_not_found", "pane not found");
			return okJson({
				pane: {
					pane_id: pane.pane_id,
					workspace_id: pane.workspace_id,
					tab_id: pane.tab_id,
					cwd: pane.cwd,
					foreground_cwd: pane.cwd,
					revision: pane.revision,
				},
			});
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
		if (group === "pane" && action === "send-keys") {
			const pane = panes.get(rest[0]);
			if (!pane) return errJson("pane_not_found", "pane not found");
			const keys = rest.slice(1);
			sentKeys.push({ paneId: pane.pane_id, keys });
			if (keys.includes("ctrl+c") && pane.fg) {
				pane.fg = undefined;
				pane.output += "^C\n";
				pane.revision += 1;
			}
			return { exitCode: 0, stdout: "{}", stderr: "" };
		}
		if (group === "pane" && action === "send-text") {
			const pane = panes.get(rest[0]);
			if (!pane) return errJson("pane_not_found", "pane not found");
			const text = rest[1] ?? "";
			sentTexts.push({ paneId: pane.pane_id, text });
			pane.output += text;
			pane.revision += 1;
			if (pane.fg && text.includes("y\n")) {
				const startMatches = [...pane.output.matchAll(/__APANE_START_([0-9a-f]{6})__/g)];
				const tok = startMatches.at(-1)?.[1];
				pane.fg = undefined;
				if (tok) {
					pane.output += `confirmed\n__APANE_DONE_${tok}:0:${remotePwd}__\n`;
				}
			}
			return { exitCode: 0, stdout: "{}", stderr: "" };
		}
		if (group === "pane" && action === "run") {
			const pane = panes.get(rest[0]);
			if (!pane) return errJson("pane_not_found", "pane not found");
			const cmd = (rest[1] ?? "").replaceAll("'\\''", "'").replaceAll("'\\''", "'");
			const readyMatch = cmd.match(/READY_%s:(?:%d|0):%s:%s:%s[^']*' '([0-9a-f]{6})'/);
			if (readyMatch) {
				const hexId = readyMatch[1];
				const cdMatch = cmd.match(/cd -- (?:"\$HOME"(?:\/'([^']+)')?|'([^']+)')/);
				const cwd = cdMatch
					? cdMatch[2] ?? (cdMatch[1] ? `/home/remote/${cdMatch[1]}` : "/home/remote")
					: remotePwd;
				if (cwd === "/missing") {
					pane.output += `\n__APANE_READY_${hexId}:1:${pane.shellPid}:/dev/pts/9:/tmp__\n`;
				} else {
					remotePwd = cwd;
					pane.cwd = cwd;
					pane.output += `\n__APANE_READY_${hexId}:0:${pane.shellPid}:/dev/pts/9:${cwd}__\n`;
				}
				pane.revision += 1;
				return { exitCode: 0, stdout: "{}", stderr: "" };
			}
			const startMatch = cmd.match(/START_%s[^']*' '([0-9a-f]{6})'/);
			if (startMatch) {
				const tok = startMatch[1];
				pane.output += nextSilent ? `\n__APANE_START_${tok}__\n` : `\n__APANE_START_${tok}__\nhello world\n`;
				pane.revision += 1;
				if (nextExecDelay) {
					pane.fg = { name: "sudo", pid: 999 };
				} else {
					pane.cwd = remotePwd;
					pane.output += `__APANE_DONE_${tok}:${nextExitCode}:${remotePwd}__\n`;
				}
			}
			return { exitCode: 0, stdout: "{}", stderr: "" };
		}
		if (group === "pane" && action === "wait-output") {
			const pane = panes.get(rest[0]);
			if (!pane) return errJson("pane_not_found", "pane not found");
			if (onWaitAppend) {
				pane.output += onWaitAppend;
				onWaitAppend = undefined;
			}
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
			const procs = [
				...(pane.fg
					? [{ pid: pane.fg.pid, name: pane.fg.name, cmdline: pane.fg.name, cwd: pane.cwd }]
					: [{ pid: pane.shellPid, name: "zsh", cmdline: "/usr/bin/zsh", cwd: pane.cwd }]),
			];
			return okJson({
				process_info: {
					pane_id: pane.pane_id,
					shell_pid: pane.shellPid,
					foreground_process_group_id: pane.fg ? pane.fg.pid : pane.shellPid,
					foreground_processes: procs,
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
		sentKeys,
		sentTexts,
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
			pane.cwd = cwd;
			pane.fg = undefined;
			pane.revision += 1;
			pane.output += `finished line\n__APANE_DONE_${tok}:${exitCode}:${cwd}__\n`;
		},
		setRemotePwd(pwd: string) {
			remotePwd = pwd;
		},
		setWaitMiss(miss: boolean) {
			waitMiss = miss;
		},
		setOnWaitAppend(text: string | undefined) {
			onWaitAppend = text;
		},
		setNextSilent(silent: boolean) {
			nextSilent = silent;
		},
	};
}

function okJson(result: unknown): ProcessResult {
	return { exitCode: 0, stdout: JSON.stringify({ result }), stderr: "" };
}

function errJson(code: string, message: string): ProcessResult {
	return { exitCode: 1, stdout: "", stderr: JSON.stringify({ error: { code, message } }) };
}

describe("helpers", () => {
	test("parseKeyToken normalizes ctrl/esc/enter tokens and preserves newline text", () => {
		expect(parseKeyToken("ctrl-c")).toBe("ctrl+c");
		expect(parseKeyToken("CTRL+D")).toBe("ctrl+d");
		expect(parseKeyToken("^c")).toBe("ctrl+c");
		expect(parseKeyToken("escape")).toBe("esc");
		expect(parseKeyToken("enter\n")).toBeUndefined();
		expect(parseKeyToken("y\n")).toBeUndefined();
	});

	test("parseSttyMode distinguishes noecho and raw", () => {
		expect(parseSttyMode("lflags: icanon isig -echo echoe")).toBe("noecho");
		expect(parseSttyMode("lflags: -icanon isig echo")).toBe("raw");
		expect(parseSttyMode("lflags: icanon isig echo")).toBeUndefined();
	});

	test("parseJobOutput extracts body, exit code, and cwd between markers", () => {
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

	test("parseJobOutput handles inline start marker and READY boundary fallback", () => {
		const inline = [
			"prompt$ __APANE_START_abc123__first",
			"second",
			"__APANE_DONE_abc123:0:/srv/app__",
		].join("\n");
		expect(parseJobOutput(inline, "abc123", "__APANE_START_abc123__")).toEqual({
			done: true,
			exitCode: 0,
			cwd: "/srv/app",
			output: "first\nsecond",
		});

		const withoutStart = [
			"exec 'ssh' ...",
			"__APANE_READY_112233:0:42:/dev/pts/1:/srv/app__",
			"fresh output",
			"__APANE_DONE_abc123:0:/srv/app__",
		].join("\n");
		expect(parseJobOutput(withoutStart, "abc123", "__APANE_START_abc123__")).toEqual({
			done: true,
			exitCode: 0,
			cwd: "/srv/app",
			output: "fresh output",
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
		const sendRes = await service.send({ id: p1.id, input: "cd sub && echo hi" });
		expect(sendRes).toEqual({
			id: p1.id,
			status: "idle",
			cwd: "/Users/supercgor/repo/sub",
			exit_code: 0,
			output: "hello world",
		});

		const inspected = await service.get({ id: p1.id });
		expect(inspected).toEqual({
			id: p1.id,
			host: "mac",
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
		expect(await service.get()).toEqual({ panes: [] });
	});

	test("send injects interactive text (y\\n) and keys (ctrl-c) while busy, and errors on idle ctrl-c", async () => {
		const cache = await tempCache();
		const harness = createHerdrHarness();
		const service = new PaneService({
			runner: harness.runner,
			env: { AGENTS_SSH_CACHE_DIR: cache },
			allowLocal: true,
		});

		const p = await service.spawn({ host: "local", cwd: "/tmp" });

		// 1. Interactive prompt resolved via send("y\n")
		harness.setDelayNextExec(true);
		const busy1 = await service.send({ id: p.id, input: "confirm", async: true });
		expect(busy1.status).toBe("busy");

		const answered = await service.send({ id: p.id, input: "y\n" });
		expect(harness.sentTexts[0]).toEqual({ paneId: "w1:p1", text: "y\n" });
		expect(answered).toEqual({
			id: p.id,
			status: "idle",
			cwd: "/tmp",
			exit_code: 0,
			output: "hello world\ny\nconfirmed",
		});

		// 2. Stuck command interrupted via send("ctrl-c") -> idle with interrupted: true
		const busy2 = await service.send({ id: p.id, input: "sleep 30", async: true });
		expect(busy2.status).toBe("busy");

		const interrupted = await service.send({ id: p.id, input: "ctrl-c" });
		expect(harness.sentKeys[0]).toEqual({ paneId: "w1:p1", keys: ["ctrl+c"] });
		expect(interrupted.status).toBe("idle");
		expect(interrupted.interrupted).toBe(true);
		expect(interrupted.output).toContain("^C");

		// 3. Interrupting an idle pane rejects clearly instead of running command in shell
		await expect(service.send({ id: p.id, input: "ctrl-c" })).rejects.toThrow("cannot interrupt idle pane");
		await expect(service.send({ id: p.id, input: "esc" })).rejects.toThrow("cannot interrupt idle pane");
	});

	test("get(id) inspects busy pane non-blockingly and wait settles busy -> idle across reconcile", async () => {
		const cache = await tempCache();
		const harness = createHerdrHarness({ remoteHerdrHosts: ["judy"] });
		const service = new PaneService({
			runner: harness.runner,
			env: { AGENTS_SSH_CACHE_DIR: cache },
		});

		const spawned = await service.spawn({ host: "judy" });

		harness.setDelayNextExec(true);
		const busy = await service.send({ id: spawned.id, input: "sudo id", async: true });
		expect(busy).toEqual({ id: spawned.id, status: "busy", cwd: "/home/user" });

		const pane = harness.panes.get("w1:p1")!;
		pane.fg = { name: "sudo", pid: 999 };
		pane.stty = "lflags: icanon isig -echo";

		const snap = await service.get({ id: spawned.id });
		expect(snap).toEqual({
			id: spawned.id,
			host: "judy",
			status: "busy",
			cwd: "/home/user",
			fg: "sudo",
			tty: "noecho",
			output: "hello world",
		});

		const all = await service.get();
		expect(all).toEqual({
			panes: [{ id: spawned.id, host: "judy", status: "busy", cwd: "/home/user", fg: "sudo" }],
		});

		const stillBusy = await service.wait({ id: spawned.id, timeout_ms: 50 });
		expect(stillBusy).toEqual({
			id: spawned.id,
			status: "busy",
			cwd: "/home/user",
			fg: "sudo",
			tty: "noecho",
			stalled: true,
			output: "hello world",
		});

		harness.completeLastDelayedJob("w1:p1", "/tmp/done", 0);
		const listed = await service.get();
		expect(listed).toEqual({
			panes: [{ id: spawned.id, host: "judy", status: "idle", cwd: "/tmp/done" }],
		});

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
			allowLocal: true,
		});

		const spawned = await service.spawn();
		harness.setWaitMiss(true);
		const res = await service.send({ id: spawned.id, input: "echo ok", timeout_ms: 50 });
		expect(res).toEqual({
			id: spawned.id,
			status: "idle",
			cwd: "/home/user",
			exit_code: 0,
			output: "hello world",
		});
	});

	test("lazy GC reclaims idle local panes even when shell_pid appears in foreground_processes", async () => {
		const cache = await tempCache();
		const harness = createHerdrHarness();
		let nowMs = 1_000_000;
		const service = new PaneService({
			runner: harness.runner,
			env: { AGENTS_SSH_CACHE_DIR: cache, AGENTS_SSH_IDLE_TTL: "60" },
			allowLocal: true,
			now: () => nowMs,
		});

		await service.spawn({ host: "local" });
		const pinned = await service.spawn({ host: "local", ttl: 0 });
		expect(harness.panes.size).toBe(2);

		nowMs += 61_000;
		const listed = await service.get();
		expect("panes" in listed && listed.panes.map((p) => p.id)).toEqual([pinned.id]);
		expect(harness.panes.size).toBe(1);
	});

	test("omits stalled when output advances during wait even if revision stays 0", async () => {
		const cache = await tempCache();
		const harness = createHerdrHarness();
		const service = new PaneService({
			runner: harness.runner,
			env: { AGENTS_SSH_CACHE_DIR: cache },
			allowLocal: true,
		});

		const spawned = await service.spawn({ host: "local" });
		harness.setDelayNextExec(true);
		const busy = await service.send({ id: spawned.id, input: "long-task", async: true });
		expect(busy.status).toBe("busy");

		const pane = harness.panes.get("w1:p1")!;
		pane.revision = 0;
		pane.fg = { name: "uv", pid: 999 };
		harness.setOnWaitAppend("progress line\n");

		const progressing = await service.wait({ id: spawned.id, timeout_ms: 50 });
		expect(progressing.status).toBe("busy");
		expect(progressing.stalled).toBeUndefined();
		expect(progressing.output).toContain("progress line");

		const silent = await service.wait({ id: spawned.id, timeout_ms: 50 });
		expect(silent.status).toBe("busy");
		expect(silent.stalled).toBe(true);
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

	test("rejects non-control keys like enter on idle pane and omits empty output", async () => {
		const cache = await tempCache();
		const harness = createHerdrHarness();
		const service = new PaneService({
			runner: harness.runner,
			env: { AGENTS_SSH_CACHE_DIR: cache },
		});

		const spawned = await service.spawn({ host: "mac" });
		await expect(service.send({ id: spawned.id, input: "enter" })).rejects.toThrow("cannot send key enter to idle pane");

		harness.setNextSilent(true);
		const silent = await service.send({ id: spawned.id, input: "true" });
		expect(silent).toEqual({
			id: spawned.id,
			status: "idle",
			cwd: "/home/user",
			exit_code: 0,
		});
		expect("output" in silent).toBe(false);
	});

	test("expands ~ and ~/ in spawn.cwd and remote download/upload paths", async () => {
		const cache = await tempCache();
		const dl = await tempCache();
		const localSrc = `${dl}/sample.txt`;
		await Bun.write(localSrc, "hi");
		const harness = createHerdrHarness();
		const service = new PaneService({
			runner: harness.runner,
			env: { AGENTS_SSH_CACHE_DIR: cache },
			downloadsDir: dl,
		});

		const p1 = await service.spawn({ host: "mac", cwd: "~" });
		expect(p1.cwd).toBe("/home/remote");
		const p2 = await service.spawn({ host: "mac", cwd: "~/work/proj" });
		expect(p2.cwd).toBe("/home/remote/work/proj");

		const downloaded = await service.download({ id: p2.id, remote: "~/logs/run.log" });
		expect(downloaded.remote).toBe("/home/remote/logs/run.log");
		expect(harness.sftpCalls.at(-1)?.stdin).toContain('"/home/remote/logs/run.log"');

		const uploaded = await service.upload({ id: p2.id, local: localSrc, remote: "~" });
		expect(uploaded.remote).toBe("/home/remote/sample.txt");
	});

	test("rejects download and upload on local panes", async () => {
		const cache = await tempCache();
		const harness = createHerdrHarness();
		const service = new PaneService({
			runner: harness.runner,
			env: { AGENTS_SSH_CACHE_DIR: cache },
			allowLocal: true,
		});

		const localPane = await service.spawn();
		await expect(service.download({ id: localPane.id, remote: "a.txt" })).rejects.toThrow("remote panes");
		await expect(service.upload({ id: localPane.id, local: "a.txt" })).rejects.toThrow("remote panes");
	});

	test("rejects local panes when allowLocal is false (default)", async () => {
		const cache = await tempCache();
		const harness = createHerdrHarness();
		const service = new PaneService({
			runner: harness.runner,
			env: { AGENTS_SSH_CACHE_DIR: cache },
		});

		await expect(service.spawn()).rejects.toThrow("host is required");
		await expect(service.spawn({ host: "local" })).rejects.toThrow("local panes are disabled");
		await expect(service.spawn({ host: "localhost" })).rejects.toThrow("local panes are disabled");
	});
});
