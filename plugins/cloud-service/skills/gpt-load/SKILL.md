---
name: gpt-load
description: Deploy and operate GPT-Load on oracle-kr, including its Docker Compose deployment, Tailscale-only access, configuration, backups, upgrades, and troubleshooting.
metadata:
  short-description: Operate GPT-Load on oracle-kr
---

# GPT-Load on oracle-kr

Use this skill for the self-hosted GPT-Load deployment on `oracle-kr` and for product-specific questions that require the bundled official documentation.

## Deployment facts

- Host: `oracle-kr`, SSH user `ubuntu`; Docker Compose v2 is installed.
- Compose directory: `/home/ubuntu/gpt-load`.
- Image channel: `ghcr.io/tbphp/gpt-load:2`; check the bundled versioning guide before changing tags. Deployed 2026-09-23.
- Web/API listener: host port `28082`, published only on Tailnet address `100.73.121.102`.
- Admin UI: `http://100.73.121.102:28082`; health check: `http://100.73.121.102:28082/health`; OpenAI-compatible base URL: `http://100.73.121.102:28082/v1`.
- Persistent state is in the Compose named volume `gpt-load-data`, including SQLite, `auth.key`, and `encryption.key`. Back up the database and encryption key together; never put key contents in this skill, logs, or repository files.
- The generated management key is at `/app/data/auth.key` inside the container. Retrieve it only over authenticated SSH with `cd /home/ubuntu/gpt-load && docker compose exec -T gpt-load sh -c 'cat /app/data/auth.key'`; keep its value out of shared logs and notes.
- Subscription OAuth callback ports `1455`, `54545`, and `51121` are already used by CLIProxyAPI on this host. GPT-Load does not publish those ports. API-key channels remain available; do not enable subscription OAuth callback publishing without first resolving the port ownership and planning a non-disruptive alternative.
- Do not bind the service to `0.0.0.0` or the public VNIC. Keep the main port bound to `100.73.121.102`.

The initial deployment was checked from both the host and a Tailnet client: `/health` returned HTTP 200, the container reported healthy, and access via the host's `10.1.22.111` LAN address failed. Re-run those checks after network or Compose edits; the Tailnet IP is runtime state and may change.

## Operating workflow

1. Before changing anything, inspect the current Compose config, container, volume, Tailnet address, and listeners on `oracle-kr`. Preserve other projects and their ports.
2. Make a secret-safe backup before changing data paths, database settings, encryption keys, or migrations. Never replace `encryption.key` independently of the database.
3. Validate Compose rendering before applying changes. After deployment or upgrade, verify container health, `/health` over Tailnet, and non-reachability on the host's public/LAN address. Do not infer runtime health from valid YAML alone.
4. For upgrades, read the current official known-limitations/versioning page, pull the intended image tag, update only this Compose project, then recheck health and persistent volume attachment.
5. Retrieve the management key only through an authenticated SSH session using the documented container data path. Do not print it into shared output or add it to any skill/reference file.

## Official documentation snapshot

The Chinese documentation snapshot is in [references/official-docs](references/official-docs). Use [references/official-docs-index.md](references/official-docs-index.md) to find a page. The snapshot was downloaded from the official documentation site on 2026-09-23; check the live page before relying on drift-prone version details.

For initial setup, read quick start, deployment, security, clients, and access keys. For maintenance, read database and backup, environment variables, known limitations/versioning, monitoring, and errors/recovery. Read subscription accounts only when callback port ownership has been resolved.
