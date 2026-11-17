<!-- Source: https://www.gpt-load.com/docs/reference/env?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 参考</span>

</div>

# 环境变量

进程级配置，写在 .env 里，改完需要重启。这是一张查表用的页面，不用通读。

<div class="docs-rule">

</div>

<div class="prose">

## 和运行时设置的区别<a href="#diff" class="anchor" aria-label="复制本节链接">§</a>

GPT-Load 有两套配置，容易混淆：

<div class="tbl-wrap">

| 类型       | 改在哪      | 生效方式                                         |
|------------|-------------|--------------------------------------------------|
| 环境变量   | `.env` 文件 | **需要重启**。管进程本身：监听地址、数据库、密钥 |
| 运行时设置 | 管理台      | **即时生效**。管调度行为：超时、重试、亲和       |

</div>

本页只讲前者。调度相关的参数见 [运行时设置](/docs/settings)。

## 进程与网络<a href="#net" class="anchor" aria-label="复制本节链接">§</a>

<div class="tbl-wrap">

| 变量 | 默认值 | 说明 |
|----|----|----|
| HOST | 127.0.0.1 | 监听地址。改成 0.0.0.0 等于对外开放，务必先读安全页 |
| PORT | 3001 | 监听端口，必须在 1–65535 之间 |
| READ_TIMEOUT | 60 | 读取请求的超时，单位秒 |
| IDLE_TIMEOUT | 120 | 连接空闲超时，单位秒 |
| GRACEFUL_SHUTDOWN_TIMEOUT | 10 | 优雅关闭的等待时长，单位秒 |

</div>

<div class="notice notice-blue">

<span class="t">所有超时项的单位都是秒</span>

不是毫秒。这是最容易配错的一处—— 写成 `60000` 会得到一个 16 小时的超时。

</div>

## 数据与存储<a href="#data" class="anchor" aria-label="复制本节链接">§</a>

<div class="tbl-wrap">

| 变量 | 默认值 | 说明 |
|----|----|----|
| DATA_DIR | ./data | 受管数据目录，保存默认 SQLite、自动生成的密钥和运行状态文件；使用外部数据库或显式密钥时，对应文件不在这里 |
| DATABASE_DSN | （空） | 留空用受管 SQLite；填入则连接外部数据库 |
| DATABASE_MAX_OPEN_CONNECTIONS | 10 | 数据库最大连接数。仅对 MySQL 与 PostgreSQL 生效，SQLite 始终单连接 |
| DATABASE_MAX_IDLE_CONNECTIONS | 5 | 最大空闲连接数，不得大于上一项。同样只对 MySQL 与 PostgreSQL 生效 |

</div>

`DATABASE_DSN` 的写法与三种驱动的取舍见 [数据库与备份](/docs/database)。

## 密钥<a href="#secret" class="anchor" aria-label="复制本节链接">§</a>

<div class="tbl-wrap">

| 变量 | 默认值 | 说明 |
|----|----|----|
| AUTH_KEY | （自动生成） | 管理台登录密钥。留空则生成到 `DATA_DIR/auth.key` |
| ENCRYPTION_KEY | （自动生成） | 加密渠道凭据。留空则生成到 `DATA_DIR/encryption.key`。**不支持轮换，必须与数据库一起备份** |

</div>

两把密钥的完整说明见 [安全与上生产](/docs/security)。

## 出站代理<a href="#proxy" class="anchor" aria-label="复制本节链接">§</a>

<div class="tbl-wrap">

| 变量        | 默认值 | 说明                                            |
|-------------|--------|-------------------------------------------------|
| HTTP_PROXY  | （空） | HTTP 上游请求的环境代理                         |
| HTTPS_PROXY | （空） | HTTPS 上游请求的环境代理                        |
| NO_PROXY    | （空） | 逗号分隔的主机、域名或 IP，这些目标不走环境代理 |

</div>

<div class="notice notice-blue">

<span class="t">它们是最后一层兜底</span>

环境代理**只在凭据、分组和全局设置都没有指定代理时才生效**。 在管理台里配了代理之后，这几个变量就不再起作用。 完整的优先级链见 [代理与请求头](/docs/advanced/proxy-and-headers)。

</div>

## 日志<a href="#log" class="anchor" aria-label="复制本节链接">§</a>

<div class="tbl-wrap">

| 变量 | 默认值 | 说明 |
|----|----|----|
| LOG_LEVEL | info | 支持 `panic`、`fatal`、`error`、`warn`、`warning`、`info`、`debug`、`trace`；无效值会告警并回退到 `info` |
| LOG_FORMAT | text | 只接受 `text` 或 `json`，接日志系统时用后者 |

</div>

这里说的是**进程日志**（程序运行状况）， 不是请求日志。请求日志的留存天数在管理台配置。

## 模型价格同步<a href="#misc" class="anchor" aria-label="复制本节链接">§</a>

<div class="tbl-wrap">

| 变量 | 默认值 | 说明 |
|----|----|----|
| MODELS_DEV_AUTO_SYNC_ENABLED | （未设置） | 是否自动从 Models.dev 同步模型价格。 不设置时由管理台的持久化设置决定，初始为开启 |

</div>

<div class="notice notice-amber">

<span class="t">设了它，管理台里的开关会变成只读</span>

这个变量**不设置**时，开关由管理台掌握，随时可改。 一旦在 `.env` 里显式设成 `true` 或 `false`， 它就成了强制值，**管理台中的同名选项会变为只读**。 如果你发现管理台里关不掉自动同步，先检查这个变量。 价格来源见 [模型管理](/docs/models)。

</div>

## 容器里的覆写<a href="#docker" class="anchor" aria-label="复制本节链接">§</a>

<div class="notice notice-amber">

<span class="t">容器内这两项改了也没用</span>

Compose 部署时，容器内的 `HOST` 被固定为 `0.0.0.0`、`DATA_DIR` 被固定为 `/app/data`。 在 `.env` 里改这两个**不会生效**。

</div>

真正决定外部能否访问的是**端口发布配置**—— 默认只发布到宿主机的 `127.0.0.1`：

<div class="code-wrap">

<div class="code-cap">

<span class="label">docker-compose.yml</span>

</div>

<div class="code-box">

ports:\
  - <span class="s">"\$\${BIND_ADDRESS:-\${HOST:-127.0.0.1}}:\$\${PORT:-3001}:\$\${PORT:-3001}"</span>

复制

</div>

</div>

也就是说：在容器部署里，BIND_ADDRESS 已设置时控制发布到宿主机的地址；未设置时才回退到 HOST。它们都不控制容器内监听地址。要对外提供服务，正确做法是加反向代理。

还有三个变量**只在 Compose 部署里有意义**， 直接跑二进制时它们不起作用：

<div class="tbl-wrap">

| 变量 | 默认值 | 说明 |
|----|----|----|
| BIND_ADDRESS | 继承 HOST | 只影响 Compose：单独指定主服务端口发布到宿主机的哪个地址，不影响回调端口 |
| OAUTH_CALLBACK_BIND_ADDRESS | 继承 HOST | 只影响 Compose：单独指定 1455、54545、51121 三个回调端口的发布地址 |
| CONTAINER_STOP_GRACE_PERIOD | 15s | 只影响 Compose：强制停止容器前的等待时间，用 Docker 时长写法，应大于 GRACEFUL_SHUTDOWN_TIMEOUT |

</div>

`OAUTH_CALLBACK_BIND_ADDRESS` 的使用场景见 [订阅账号](/docs/groups/subscription)—— 简单说：**不要为了完成授权把它改成 `0.0.0.0`**。

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">渠道与能力矩阵</span>](/docs/reference/support-matrix)<a href="/docs/reference/api" class="next"><span class="k">下一页 →</span><span class="t">管理 API</span></a>

</div>

</div>
