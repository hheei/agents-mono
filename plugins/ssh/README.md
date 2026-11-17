# SSH Panes Plugin

Stateful remote/local shell panes backed by Herdr + OpenSSH ControlMaster + SFTP.

## Tools (`ssh` namespace)

- `list`: List active panes with status (`idle` / `running`), `cwd`, and active `job_id`.
- `spawn`: Open a persistent shell pane on an SSH alias (or `local`) and return a 6-char hex `id`.
- `exec`: Run a command in a pane (sync wait by default, or `async: true`). Preserves `cd` and shell state.
- `wait`: Wait for a running command to finish or read recent output.
- `download`: SFTP download relative to the pane's current `cwd`.
- `upload`: SFTP upload relative to the pane's current `cwd`.
- `close`: Close a pane.

## Configuration

- `AGENTS_SSH_IDLE_TTL`: Idle auto-close TTL in seconds (`1800` default, `0` disables lazy GC).
- `AGENTS_SSH_CACHE_DIR`: Override cache/state directory (`~/.cache/agents-ssh` default).
- `AGENTS_SSH_CONNECT_TIMEOUT`: SSH connect timeout in seconds (`15` default).

## Install

```bash
codex plugin marketplace add hheei/agents-mono --ref main
codex plugin add ssh@agents-mono
```
