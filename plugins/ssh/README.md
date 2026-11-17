# SSH Panes Plugin

Stateful local and remote shell panes backed by Herdr + OpenSSH ControlMaster + SFTP.

## Tools (`ssh` namespace)

- `get`: List all active panes, or pass `id` to inspect a pane's state, `fg`/`tty`, and recent output without blocking.
- `spawn`: Open a shell pane (`host` defaults to `local`, or pass an SSH alias), optionally starting in `cwd` (supports `~` / `~/`), and return its 6-char lowercase hex `id`.
- `send`: Run `input` in an `idle` pane (sync wait or `async: true`), or send interactive text/keys (e.g. `"y\n"`, `"ctrl-c"`) to a `busy` pane.
- `wait`: Wait for a `busy` pane to become `idle` (reporting `fg`/`tty`/`stalled` on timeout).
- `download`: SFTP download `remote` from a remote pane (supports `~/` or relative to pane `cwd`) to `local` (defaults to `~/Downloads`).
- `upload`: SFTP upload `local` to a remote pane `remote` (supports `~/` or defaults/resolves to pane `cwd`).
- `close`: Close pane `id`.

## Configuration

- `AGENTS_SSH_IDLE_TTL`: Idle auto-close TTL in seconds (`1800` default, `0` disables lazy GC).
- `AGENTS_SSH_CACHE_DIR`: Override cache/state directory (`~/.cache/agents-ssh` default).
- `AGENTS_SSH_CONNECT_TIMEOUT`: SSH connect timeout in seconds (`15` default).

## Install

```bash
codex plugin marketplace add hheei/agents-mono --ref main
codex plugin add ssh@agents-mono
```
