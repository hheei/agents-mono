# GPT-Load official Chinese documentation snapshot

Downloaded 2026-09-23 from the official site. Each linked Markdown file contains the page content and source URL. The live documentation may change; verify version-sensitive procedures before applying them.

| Local snapshot | Official page |
| --- | --- |
| [index.md](official-docs/index.md) | [文档首页](https://www.gpt-load.com/docs?lang=zh) |
| [quickstart.md](official-docs/quickstart.md) | [快速开始](https://www.gpt-load.com/docs/quickstart?lang=zh) |
| [concepts.md](official-docs/concepts.md) | [核心概念](https://www.gpt-load.com/docs/concepts?lang=zh) |
| [install.md](official-docs/install.md) | [部署](https://www.gpt-load.com/docs/install?lang=zh) |
| [known-limitations.md](official-docs/known-limitations.md) | [已知限制与版本策略](https://www.gpt-load.com/docs/known-limitations?lang=zh) |
| [groups.md](official-docs/groups.md) | [分组与渠道](https://www.gpt-load.com/docs/groups?lang=zh) |
| [groups__subscription.md](official-docs/groups__subscription.md) | [订阅账号](https://www.gpt-load.com/docs/groups/subscription?lang=zh) |
| [models.md](official-docs/models.md) | [模型管理](https://www.gpt-load.com/docs/models?lang=zh) |
| [access-keys.md](official-docs/access-keys.md) | [访问密钥](https://www.gpt-load.com/docs/access-keys?lang=zh) |
| [clients.md](official-docs/clients.md) | [客户端接入](https://www.gpt-load.com/docs/clients?lang=zh) |
| [monitor.md](official-docs/monitor.md) | [监控与排障](https://www.gpt-load.com/docs/monitor?lang=zh) |
| [settings.md](official-docs/settings.md) | [运行时设置](https://www.gpt-load.com/docs/settings?lang=zh) |
| [database.md](official-docs/database.md) | [数据库与备份](https://www.gpt-load.com/docs/database?lang=zh) |
| [security.md](official-docs/security.md) | [安全与上生产](https://www.gpt-load.com/docs/security?lang=zh) |
| [internals__scheduling.md](official-docs/internals__scheduling.md) | [调度是怎么做的](https://www.gpt-load.com/docs/internals/scheduling?lang=zh) |
| [internals__protocols.md](official-docs/internals__protocols.md) | [协议与转换边界](https://www.gpt-load.com/docs/internals/protocols?lang=zh) |
| [advanced__proxy-and-headers.md](official-docs/advanced__proxy-and-headers.md) | [代理与请求头](https://www.gpt-load.com/docs/advanced/proxy-and-headers?lang=zh) |
| [reference__support-matrix.md](official-docs/reference__support-matrix.md) | [渠道与能力矩阵](https://www.gpt-load.com/docs/reference/support-matrix?lang=zh) |
| [reference__env.md](official-docs/reference__env.md) | [环境变量](https://www.gpt-load.com/docs/reference/env?lang=zh) |
| [reference__api.md](official-docs/reference__api.md) | [管理 API](https://www.gpt-load.com/docs/reference/api?lang=zh) |
| [reference__errors.md](official-docs/reference__errors.md) | [错误与恢复参考](https://www.gpt-load.com/docs/reference/errors?lang=zh) |
| [faq.md](official-docs/faq.md) | [常见问题](https://www.gpt-load.com/docs/faq?lang=zh) |
| [migrate-from-1x.md](official-docs/migrate-from-1x.md) | [从 1.x 迁移](https://www.gpt-load.com/docs/migrate-from-1x?lang=zh) |

## Deployment-specific reading notes

- Official repository setup artifacts were reviewed from `tbphp/gpt-load` at commit `8f894c3eed78ff3249427a9121a73e6ea0884155` on 2026-09-23 (`docker-compose.yml`, `.env.example`, and `README_CN.md`).
- The current upstream Compose file publishes three fixed OAuth callback ports in addition to the HTTP port. This host already uses all three callback ports for CLIProxyAPI, so this deployment intentionally publishes only its HTTP port.
- Upstream defaults to SQLite and a persistent Docker named volume. Preserve the volume and pair its SQLite database with `encryption.key` in backups.
