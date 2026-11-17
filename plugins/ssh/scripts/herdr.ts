import { isLocalHost, type ProcessResult, type ProcessRunner, quoteShell } from "./process";
import type { SshTransport } from "./ssh";

export interface HerdrWorkspace {
	workspace_id: string;
	label: string;
	active_tab_id?: string;
	pane_count: number;
	tab_count: number;
}

export interface HerdrPane {
	pane_id: string;
	workspace_id: string;
	tab_id: string;
	cwd: string;
	foreground_cwd?: string;
	terminal_title?: string;
	focused?: boolean;
}

export interface HerdrForegroundProcess {
	pid: number;
	name: string;
	cmdline: string;
	cwd: string;
}

export interface HerdrProcessInfo {
	pane_id: string;
	shell_pid: number;
	foreground_processes: HerdrForegroundProcess[];
}

export type HerdrTarget = "local" | string;

const WORKSPACE_LABEL = "agents-ssh";

export class HerdrClient {
	readonly #runner: ProcessRunner;
	readonly #ssh: SshTransport;

	constructor(runner: ProcessRunner, ssh: SshTransport) {
		this.#runner = runner;
		this.#ssh = ssh;
	}

	async isRunning(target: HerdrTarget): Promise<boolean> {
		try {
			await this.listWorkspaces(target);
			return true;
		} catch {
			return false;
		}
	}

	async listWorkspaces(target: HerdrTarget): Promise<HerdrWorkspace[]> {
		const json = await this.execJson<{ workspaces: HerdrWorkspace[] }>(target, ["workspace", "list"], 5_000);
		return json.workspaces ?? [];
	}

	async listPanes(target: HerdrTarget, workspaceId?: string): Promise<HerdrPane[]> {
		const args = workspaceId ? ["pane", "list", "--workspace", workspaceId] : ["pane", "list"];
		const json = await this.execJson<{ panes: HerdrPane[] }>(target, args, 5_000);
		return json.panes ?? [];
	}

	async processInfo(target: HerdrTarget, paneId: string): Promise<HerdrProcessInfo | undefined> {
		try {
			const json = await this.execJson<{ process_info: HerdrProcessInfo }>(
				target,
				["pane", "process-info", "--pane", paneId],
				5_000,
			);
			return json.process_info;
		} catch {
			return undefined;
		}
	}

	async allocatePane(
		target: HerdrTarget,
		cwd?: string,
	): Promise<{ workspaceId: string; paneId: string }> {
		const workspaces = await this.listWorkspaces(target);
		const existing = workspaces.find((ws) => ws.label === WORKSPACE_LABEL);
		if (existing) {
			const panes = await this.listPanes(target, existing.workspace_id);
			const anchor = panes[0];
			if (anchor) {
				const direction = panes.length % 2 === 1 ? "right" : "down";
				const args = ["pane", "split", anchor.pane_id, "--direction", direction, "--no-focus"];
				if (cwd) args.push("--cwd", cwd);
				const split = await this.execJson<{ pane: { pane_id: string; workspace_id?: string } }>(target, args, 10_000);
				return {
					workspaceId: split.pane.workspace_id ?? existing.workspace_id,
					paneId: split.pane.pane_id,
				};
			}
		}

		const args = ["workspace", "create", "--label", WORKSPACE_LABEL, "--no-focus"];
		if (cwd) args.push("--cwd", cwd);
		const created = await this.execJson<{
			workspace: { workspace_id: string };
			root_pane: { pane_id: string };
		}>(target, args, 10_000);
		return {
			workspaceId: created.workspace.workspace_id,
			paneId: created.root_pane.pane_id,
		};
	}

	async renamePane(target: HerdrTarget, paneId: string, label: string): Promise<void> {
		const res = await this.runHerdr(target, ["pane", "rename", paneId, label], 5_000);
		if (res.timedOut || res.exitCode !== 0) {
			throw new Error(`herdr pane rename failed: ${formatHerdrError(res)}`);
		}
	}

	async runInPane(target: HerdrTarget, paneId: string, command: string): Promise<void> {
		const res = await this.runHerdr(target, ["pane", "run", paneId, command], 10_000);
		if (res.timedOut || res.exitCode !== 0) {
			throw new Error(`herdr pane run failed: ${formatHerdrError(res)}`);
		}
	}

	async waitOutput(
		target: HerdrTarget,
		paneId: string,
		regex: string,
		timeoutMs: number,
	): Promise<boolean> {
		const args = [
			"pane",
			"wait-output",
			paneId,
			"--regex",
			regex,
			"--source",
			"recent-unwrapped",
			"--timeout",
			String(timeoutMs),
		];
		const res = await this.runHerdr(target, args, timeoutMs + 5_000);
		if (!res.timedOut && res.exitCode === 0) return true;
		if (res.timedOut) return false;
		const stderr = res.stderr.trim();
		if (/timeout|timed out/i.test(stderr)) return false;
		throw new Error(`herdr pane wait-output failed: ${formatHerdrError(res)}`);
	}

	async readPane(target: HerdrTarget, paneId: string, lines = 2000): Promise<string> {
		const res = await this.runHerdr(
			target,
			["pane", "read", paneId, "--source", "recent-unwrapped", "--lines", String(lines)],
			10_000,
		);
		if (res.timedOut || res.exitCode !== 0) {
			throw new Error(`herdr pane read failed: ${formatHerdrError(res)}`);
		}
		return res.stdout.replaceAll("\r\n", "\n");
	}

	async closePane(target: HerdrTarget, paneId: string): Promise<void> {
		const res = await this.runHerdr(target, ["pane", "close", paneId], 5_000);
		if (!res.timedOut && res.exitCode === 0) return;
		if (/pane_not_found|not found/i.test(res.stderr)) return;
		throw new Error(`herdr pane close failed: ${formatHerdrError(res)}`);
	}

	private async execJson<T>(target: HerdrTarget, args: string[], timeoutMs: number): Promise<T> {
		const res = await this.runHerdr(target, args, timeoutMs);
		if (res.timedOut || res.exitCode !== 0) {
			throw new Error(`herdr ${args.slice(0, 2).join(" ")} failed: ${formatHerdrError(res)}`);
		}
		const parsed = JSON.parse(res.stdout) as { result?: T; error?: { message?: string } };
		if (!parsed.result) {
			throw new Error(parsed.error?.message || `Unexpected herdr output for ${args.join(" ")}`);
		}
		return parsed.result;
	}

	private async runHerdr(target: HerdrTarget, args: string[], timeoutMs: number): Promise<ProcessResult> {
		if (isLocalHost(target)) {
			return await this.#runner("herdr", args, timeoutMs);
		}
		const remoteCmd = `herdr ${args.map(quoteShell).join(" ")}`;
		return await this.#ssh.exec(target, remoteCmd, timeoutMs);
	}
}

function formatHerdrError(res: ProcessResult): string {
	const raw = res.stderr.trim() || res.stdout.trim();
	if (!raw) return res.timedOut ? "timed out" : `exit ${res.exitCode}`;
	try {
		const parsed = JSON.parse(raw) as { error?: { message?: string; code?: string } };
		if (parsed.error?.message) return `${parsed.error.code ?? "error"}: ${parsed.error.message}`;
	} catch {
		// Fall back to raw text.
	}
	return raw;
}
