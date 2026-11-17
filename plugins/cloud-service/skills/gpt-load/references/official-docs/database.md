<!-- Source: https://www.gpt-load.com/docs/database?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 运维</span>

</div>

# 数据库与备份

默认的 SQLite 对绝大多数场景够用。这一页讲什么时候需要换，以及怎么备份才能真的恢复得回来。

<div class="docs-rule">

</div>

<div class="prose">

## 该用哪个<a href="#pick" class="anchor" aria-label="复制本节链接">§</a>

三种驱动是**同等受支持**的，功能没有阉割，区别在运维：

<div class="tbl-wrap">

| 驱动 | 适合 | 代价 |
|----|----|----|
| SQLite | **默认，不用装任何东西**。单机部署的首选 | 数据在本机文件里，跟着机器走 |
| MySQL | 已有 MySQL 运维体系，想统一备份和监控 | 多一个要维护的服务 |
| PostgreSQL | 同上，偏好 PG 生态 | 同上 |

</div>

<div class="notice notice-blue">

<span class="t">不用为了性能换</span>

2.0 是**单实例设计**，换成外部数据库**不会带来横向扩展能力**， 也很少是性能瓶颈所在。 换的理由通常是运维统一——比如你希望数据库备份走公司现有的那套流程。

</div>

## DSN 写法<a href="#dsn" class="anchor" aria-label="复制本节链接">§</a>

用 `DATABASE_DSN` 这一个变量决定连哪里。**留空即使用受管的 SQLite**，存在 `DATA_DIR/gpt-load.db`。

<div class="code-wrap">

<div class="code-cap">

<span class="label">三种驱动的 DSN</span>

</div>

<div class="code-box">

<span class="c">\# 留空：受管 SQLite（默认）</span>\
DATABASE_DSN=\
\
<span class="c">\# 外部 SQLite：指定文件路径</span>\
DATABASE_DSN=<span class="s">sqlite:///var/lib/gpt-load/data.db</span>\
\
<span class="c">\# MySQL</span>\
DATABASE_DSN=<span class="s">mysql://user:password@db.example:3306/gpt_load</span>\
\
<span class="c">\# PostgreSQL</span>\
DATABASE_DSN=<span class="s">postgres://user:password@db.example:5432/gpt_load</span>

复制

</div>

</div>

连接参数按各自的惯例追加在查询串里：

<div class="code-wrap">

<div class="code-cap">

<span class="label">带参数</span>

</div>

<div class="code-box">

<span class="c">\# MySQL 走 TLS</span>\
mysql://user:pass@db.example:3306/gpt_load?tls=true\
\
<span class="c">\# PostgreSQL 要求 SSL</span>\
postgres://user:pass@db.example:5432/gpt_load?sslmode=require

复制

</div>

</div>

<div class="notice notice-amber">

<span class="t">非空 DSN 一律视为你自己管理</span>

只要 `DATABASE_DSN` 非空，网关就**不再接管这个数据库的目录与文件权限**—— 即使你填的 SQLite 路径恰好等于默认位置。 权限、备份、磁盘都由你负责。

</div>

连接池大小可以调，见 [环境变量](/docs/reference/env)。

## 结构迁移<a href="#migrate" class="anchor" aria-label="复制本节链接">§</a>

版本升级时如果数据库结构有变化，**启动时会自动完成迁移**， 不需要你执行任何命令。三种驱动走同一条有序的迁移链， 已完成的跳过、未完成的按顺序执行。

<div class="notice notice-amber">

<span class="t">升级前先备份</span>

迁移是**单向的**——新版本执行过的结构变更，旧版本未必认得。 跨版本升级前务必备份，否则回滚时会卡住。

</div>

如果数据库处于无法安全恢复的中断状态，程序会**拒绝启动**并说明原因，而不是带着损坏的结构继续跑。 这时候用备份恢复是最快的路径。

## 备份<a href="#backup" class="anchor" aria-label="复制本节链接">§</a>

<div class="notice notice-amber">

<span class="t">只备数据库是不够的</span>

数据库必须和**加密密钥来自同一套实例**。 使用自动生成的密钥时，`auth.key` 和 `encryption.key`都在数据目录中；如果在环境变量或密钥管理服务中显式设置， 还要从原来的安全来源单独备份。本版本不支持主密钥轮换。

</div>

**SQLite（官方 Compose 默认配置）**——先停服务，再从现有容器解析 实际卷名并打包整个数据目录。下面的命令要在 `docker-compose.yml`所在目录执行：

<div class="code-wrap">

<div class="code-cap">

<span class="label">停机备份 Compose 的实际数据卷</span>

</div>

<div class="code-box">

docker compose stop gpt-load\
container_id=\$(docker compose ps -a -q gpt-load)\
test -n "\$container_id"\
data_volume=\$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}' "\$container_id")\
test -n "\$data_volume"\
docker volume inspect "\$data_volume" \>/dev/null\
backup_file="gpt-load-\$(date +%F-%H%M%S).tar.gz"\
docker run --rm --user 0:0 \\\
  --mount "type=volume,src=\$data_volume,dst=/data,readonly" \\\
  --mount "type=bind,src=\$PWD,dst=/backup" \\\
  alpine:3.24.1 sh -eu -c \\\
  'test -s /data/gpt-load.db; cd /data; tar -czf "/backup/\$1" .' sh "\$backup_file"\
tar -tzf "\$backup_file" \| sed -n '1,20p'\
docker compose start gpt-load

复制

</div>

</div>

`docker volume inspect` 和 `test -s` 都必须成功， 归档列表中也必须包含 `gpt-load.db`。 不要把 Compose 的逻辑卷名 `gpt-load-data` 直接写进`docker run -v`——实际卷名会随 Compose 项目名变化。

**外部数据库**——数据库用它自己的工具备份， 并从当前实例的安全来源备份匹配的 `AUTH_KEY` 与`ENCRYPTION_KEY`：

<div class="code-wrap">

<div class="code-cap">

<span class="label">使用数据库自己的备份工具</span>

</div>

<div class="code-box">

mysqldump -h db.example -u user -p gpt_load \> gpt_load.sql\
<span class="c">\# 或</span>\
pg_dump -h db.example -U user gpt_load \> gpt_load.sql

复制

</div>

</div>

备份文件**本身包含可解密的凭据**， 按敏感数据对待——加密存放，别丢进公开网盘或仓库。

## 恢复<a href="#restore" class="anchor" aria-label="复制本节链接">§</a>

恢复的关键是**数据库、加密密钥和程序版本必须匹配**。 不要把备份内容直接覆盖到一个已有数据的目录或卷中。

1.  停止目标服务，并先备份目标当前数据
2.  校验归档，恢复到新的空目录或空卷
3.  恢复与数据库匹配的 `ENCRYPTION_KEY`；显式设置的密钥从原安全来源恢复
4.  首次使用与备份相同的 GPT-Load 版本启动，不要同时升级
5.  检查健康状态，并登录管理台确认渠道凭据可以正常解密

**验证过能恢复，备份才算数。**建议在非生产环境实际走一遍这个流程，别等出事才发现备份不完整。

## 换驱动<a href="#switch" class="anchor" aria-label="复制本节链接">§</a>

**没有自动的数据搬迁工具。**换驱动等于换一套新数据库， 原有配置需要重新录入。

如果配置量大，比较务实的做法是：**并行跑一段时间**—— 新起一个实例连新数据库、配好、验证，再把流量切过去， 和 [从 1.x 迁移](/docs/migrate-from-1x) 的思路一致。

换驱动后 `encryption.key` **不要换**—— 沿用原来那把，重新录入的凭据才能和旧备份保持一致的加密方式。 当然，如果是全新录入，用新密钥也可以，但要记得更新备份。

[查看数据库与迁移边界 →](/docs/known-limitations#runtime)

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">运行时设置</span>](/docs/settings)<a href="/docs/security" class="next"><span class="k">下一页 →</span><span class="t">安全与上生产</span></a>

</div>

</div>
