<!-- Source: https://www.gpt-load.com/docs/security?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 运维</span>

</div>

# 安全与上生产

正式用起来之前，把这一页从头到尾走一遍。多数事故来自两件事：密钥没备份，或者服务被暴露到了公网。

<div class="docs-rule">

</div>

<div class="prose">

## 两把密钥<a href="#keys" class="anchor" aria-label="复制本节链接">§</a>

GPT-Load 有两把用途完全不同的密钥，别混淆：

<div class="tbl-wrap">

| 密钥           | 作用               | 丢了会怎样                   |
|----------------|--------------------|------------------------------|
| AUTH_KEY       | 登录管理台         | 换一把即可，不影响数据       |
| ENCRYPTION_KEY | 加密存储的上游凭据 | **已加密的凭据永久无法恢复** |

</div>

两把都可以在 `.env` 里显式指定；不指定时， 首次启动会自动生成并存放在数据目录下的 `auth.key` 与 `encryption.key`。

<div class="notice notice-amber">

<span class="t">不支持主密钥轮换</span>

本版本**没有提供更换 ENCRYPTION_KEY 的能力**。 一旦更换或丢失，已经存进去的渠道凭据就解不开了，只能全部重新录入。 换句话说：**这把密钥要和数据库同等对待**。

</div>

## 备份<a href="#backup" class="anchor" aria-label="复制本节链接">§</a>

**数据库和加密密钥必须成套备份。**自动生成的 `auth.key` 与 `encryption.key` 在数据目录中； 显式设置的 `AUTH_KEY` 与 `ENCRYPTION_KEY` 则要从原来的 环境变量或密钥管理服务单独备份。

<div class="notice notice-amber">

<span class="t">Compose 必须停机备份</span>

SQLite 使用 WAL，不能在服务运行时直接打包数据卷。 Compose 的实际卷名还会随项目名变化，不能硬编码成 `gpt-load-data`。 请使用 [数据库与备份](/docs/database#backup) 中的完整命令。

</div>

**备份文件本身包含可解密的凭据**， 要按敏感数据对待——加密存放，不要丢进公开的网盘或仓库。

换数据库驱动、迁移服务器时的注意事项见 [数据库与备份](/docs/database)。

## 网络边界<a href="#network" class="anchor" aria-label="复制本节链接">§</a>

服务**默认只监听 127.0.0.1**，也就是只有本机能访问。 这是有意的默认值——管理台一旦暴露到公网， 拿到 `AUTH_KEY` 就等于拿到了你所有的上游凭据。

<div class="notice notice-amber">

<span class="t">不要图省事直接开放</span>

把 `HOST` 改成 `0.0.0.0` 并把端口直接映射到公网 IP， 是最常见也最危险的做法。**正确方式是通过反向代理，并加上 TLS 与访问控制。**

</div>

需要远程访问时，按风险从低到高：

1.  **SSH 端口转发**——最安全，不需要改任何服务配置：

<div class="code-wrap">

<div class="code-cap">

<span class="label">把远程服务映射到本机</span>

</div>

<div class="code-box">

ssh -L 3001:127.0.0.1:3001 user@your-server\
<span class="c">\# 然后在本机浏览器打开 http://127.0.0.1:3001</span>

复制

</div>

</div>

2.  **内网 / VPN**——只在受控网络内暴露
3.  **反向代理 + TLS + 访问控制**——确实需要公网访问时，见下一节

## 反向代理<a href="#proxy" class="anchor" aria-label="复制本节链接">§</a>

用 Nginx、Caddy 一类在前面挡一层，至少要做到三件事：**启用 HTTPS、限制来源、不要把管理台和数据面一起裸奔**。

<div class="code-wrap">

<div class="code-cap">

<span class="label">Nginx 示例：管理面限制来源</span>

</div>

<div class="code-box">

server {\
    listen 443 ssl;\
    server_name gateway.example.com;\
\
    <span class="c">\# 证书配置略</span>\
\
    <span class="c">\# 管理面：只允许可信来源</span>\
    location /api/ {\
        allow 203.0.113.0/24;\
        deny all;\
        proxy_pass http://127.0.0.1:3001;\
    }\
\
    <span class="c">\# 数据面：按需开放，注意流式响应要关缓冲</span>\
    location / {\
        proxy_pass http://127.0.0.1:3001;\
        proxy_buffering off;\
        proxy_read_timeout 600s;\
    }\
}

复制

</div>

</div>

`proxy_buffering off` 和较长的读超时是必要的—— 流式响应如果被代理缓冲住，客户端会一直等不到输出。

## 文件权限<a href="#perm" class="anchor" aria-label="复制本节链接">§</a>

受管的数据目录会被收紧到与运行身份相匹配的访问权限， 程序启动时自动处理，通常不需要你干预：

- 数据目录：`0700`（仅属主可读写执行）
- 数据库文件与两把密钥：`0600`（仅属主可读写）
- Windows 前台运行使用当前用户 ACL；安装器服务使用服务 SID 与本地 Administrators ACL

如果无法确认目录归属或链接类型，程序会**拒绝启动**而不是降级运行——这是有意的，避免在权限不明的位置写入凭据。

## 不要泄漏的东西<a href="#leak" class="anchor" aria-label="复制本节链接">§</a>

- **两把密钥**——不要提交到仓库、贴进 issue、发在群里
- **备份文件**——它包含可解密的凭据
- **截图**——管理台截图里常带账号邮箱和密钥后缀， 发出去之前先打码
- **访问密钥**——虽然可以吊销，但泄漏期间的用量是真金白银

发现安全问题请按仓库 `SECURITY.md` 里的流程私下反馈，**不要开公开 issue**。

## 上生产清单<a href="#checklist" class="anchor" aria-label="复制本节链接">§</a>

逐条确认，再让真实流量进来：

- **密钥**——`AUTH_KEY` 与 `ENCRYPTION_KEY` 已显式设置或已确认自动生成的值被备份
- **备份**——数据库和 `encryption.key` 一起备过，并且**验证过能恢复**
- **网络**——没有把服务直接绑到 `0.0.0.0` 暴露公网； 远程访问走 SSH 转发、内网或带 TLS 的反向代理
- **管理面**——`/api` 有来源限制，没有对公网开放
- **访问密钥**——按应用分别发放，设置了合理的限流与成本上限
- **监控**——知道去哪看健康状态与请求日志，见 [监控与排障](/docs/monitor)
- **边界认知**——理解成本是估算、2.0 面向单实例部署

<div class="notice notice-blue">

<span class="t">单实例设计</span>

2.0 只保证**单个应用实例**的正确性，实例之间不共享状态。 不要在多个实例前面挂负载均衡——调度、冷却、限流的状态都会各算各的。 需要更大规模时，按业务维度拆成多个独立部署。

</div>

[查看完整的 2.0 已知限制 →](/docs/known-limitations)

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">数据库与备份</span>](/docs/database)<a href="/docs/internals/scheduling" class="next"><span class="k">下一页 →</span><span class="t">调度是怎么做的</span></a>

</div>

</div>
