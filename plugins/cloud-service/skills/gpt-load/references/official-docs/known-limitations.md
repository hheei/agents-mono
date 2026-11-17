<!-- Source: https://www.gpt-load.com/docs/known-limitations?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 开始使用</span>

</div>

# 2.0 已知限制与版本策略

部署、升级或切换生产流量前，一次确认 2.0 的运行边界、兼容性和版本通道。

<div class="docs-rule">

</div>

<div class="prose">

## 部署与数据<a href="#runtime" class="anchor" aria-label="复制本节链接">§</a>

<div class="notice notice-amber">

<span class="t">只支持单实例</span>

2.0 只保证单个应用实例的正确性。调度、冷却、限流与亲和等状态不会在实例之间共享；换用外部数据库也不会获得横向扩展能力。

</div>

需要隔离业务或扩大容量时，按业务维度拆成多个独立部署，不要在同一套配置前直接增加负载均衡实例。

[查看安全与上生产 →](/docs/security)

<div class="notice notice-amber">

<span class="t">1.x 不能原地升级</span>

2.0 不能打开、导入或转换 1.x 的数据。两套版本必须使用不同的数据库、数据目录、端口与 Docker 卷。

</div>

正确方式是并行部署 2.0，重新配置并验证，再切换流量；回滚窗口结束前保留原来的 1.x 实例。

[查看从 1.x 迁移 →](/docs/migrate-from-1x)

<div class="notice notice-blue">

<span class="t">不自动跨数据库驱动搬迁数据</span>

版本升级需要的 Schema 迁移会在启动时自动执行；但在 SQLite、MySQL 与 PostgreSQL 之间切换时，GPT-Load 不会复制原有配置和数据。

</div>

换驱动时请使用新数据库重新配置、验证并切流量。不要把它和自动 Schema 迁移混为一谈。

[查看数据库与备份 →](/docs/database)

## 成本与软限制<a href="#cost" class="anchor" aria-label="复制本节链接">§</a>

<div class="notice notice-amber">

<span class="t">成本是估算，不是账单</span>

成本根据上游返回的 token 用量和模型价格计算。缺少用量或价格的请求不能完整计价，价格变化也不会回算历史。

</div>

这些数据适合运营分析与异常保护，不适合财务对账。

<div class="notice notice-amber">

<span class="t">成本限制是软保护</span>

网关在请求完成后才把本次估算成本计入额度。单次大请求和已经放行的并发请求可能让累计金额超过阈值；未定价或缺少用量的请求也不会计入。

</div>

需要严格预算时，还应使用服务商提供的账单告警、预算或硬额度。

[查看访问密钥成本限制 →](/docs/access-keys)

## Responses 有状态资源<a href="#responses" class="anchor" aria-label="复制本节链接">§</a>

<div class="notice notice-amber">

<span class="t">响应续接不等于完整资源绑定</span>

网关可为受支持的原生 Responses 响应登记归属，让 previous_response_id 续接回到原凭据。未知、过期或淘汰的 ID 会被拒绝；conversation 和其他资源操作不在该绑定保证内。

</div>

其他有状态资源仍需单凭据分组，或确认上游允许跨凭据共享。续接绑定也不保证上游历史持续有效或网关崩溃后可恢复。

[查看协议与转换边界 →](/docs/internals/protocols)

## 加密密钥<a href="#encryption" class="anchor" aria-label="复制本节链接">§</a>

<div class="notice notice-amber">

<span class="t">不支持 ENCRYPTION_KEY 轮换</span>

更换或丢失 ENCRYPTION_KEY 后，已有渠道凭据无法解密。当前没有使用新旧两把主密钥重加密现有数据的流程。

</div>

数据库与加密密钥必须成套备份；恢复时先使用与备份匹配的程序版本和密钥。

[查看密钥与备份要求 →](/docs/security)

## 版本与镜像标签<a href="#tags" class="anchor" aria-label="复制本节链接">§</a>

<div class="tbl-wrap">

| 标签 | 含义 | 适用场景 |
|----|----|----|
| 2.0.0-rc.3 | 精确版本标签，不带 Git tag 的 v 前缀 | 需要固定版本时使用；生产环境也可以固定镜像摘要 |
| 2 | 2.x 浮动通道；GA 前可跟随已验证的 2.0 Beta 与 RC，GA 后只跟随稳定 2.x | 接受经过发布门禁的新版本时使用 |
| 2.0-beta | 只跟随格式严格的 2.0 Beta，不跟随 RC | 只想停留在 Beta 通道时使用 |
| 2.0-rc | 不存在这个浮动标签；RC 使用精确标签，GA 前也可能推进 2 | 不要配置 |
| latest | 过渡期保留的旧标签，不再随 1.x 发布更新 | 1.x 使用 1；2.x 使用 2 或精确版本标签 |

</div>

数据库迁移是单向的。回滚不能只改镜像标签，还要恢复升级前的数据库和配套密钥。

[查看部署与升级流程 →](/docs/install)

## 维护政策<a href="#maintenance" class="anchor" aria-label="复制本节链接">§</a>

- 2.0 GA 前属于预发布安全支持候选；发布就绪状态以实际 Release 与制品为准。
- 1.4.x 处于维护状态，只接受安全与严重缺陷修复，不再增加新功能。
- 当前没有公开的 1.4.x EOL 日期或 2.0.x 固定支持周期；后续以正式发布说明为准。

[查看发布记录与当前版本 →](/changelog)

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">部署</span>](/docs/install)<a href="/docs/groups" class="next"><span class="k">下一页 →</span><span class="t">分组与渠道</span></a>

</div>

</div>
