<!-- Source: https://www.gpt-load.com/docs/groups/subscription?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 配置</span>

</div>

# 订阅账号

Codex、Claude、Antigravity、Grok 这类按订阅计费的账号，可完成 OAuth 授权，也可导入已有 OAuth JSON。接进来之后，它们和 API 密钥共用同一套调度。

<div class="docs-rule">

</div>

<div class="prose">

## 和 API 密钥的区别<a href="#what" class="anchor" aria-label="复制本节链接">§</a>

对网关来说，订阅账号和 API 密钥都只是「一池凭据」——**轮转、重试、冷却、健康隔离完全共用一套机制**， 你不需要为订阅账号单独维护一套运维逻辑。

差别只在三处：

- **接入方式**——完成一次 OAuth 授权，或导入已有 OAuth JSON
- **凭据会过期**——网关自动刷新；遇到授权异常时，可手动刷新凭据或重新连接账号
- **有额度窗口**——订阅按周期计量，管理台会展示剩余额度与重置时间

## 接入一个账号<a href="#add" class="anchor" aria-label="复制本节链接">§</a>

订阅账号也是建在分组里的。进入「分组 → 新建分组」，选择 Codex、Claude、Antigravity 或 Grok，然后连接账号或导入凭据。

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fsub-01-connect.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fsub-01-connect.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="Codex 订阅分组的连接账号面板，显示 OAuth 授权链接和回调地址输入框" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>授权入口常驻展开，不折叠——远程部署时需要手动复制链接与回调地址，是高频路径而非兜底方案。</p>
<figcaption><span class="label">FIG. 1 — 连接账号</span><span class="label">授权入口</span></figcaption>
</figure>

接入方式分三类，取决于渠道和你是否已有授权凭据：

- **本地回调**（Codex、Claude、Antigravity）——浏览器完成授权后， 上游会跳回本机的一个固定端口，网关在那里接住授权码
- **设备码**（Grok）——页面给出一个验证码，你在上游网站输入它完成授权，**不需要任何回调端口**
- **OAuth JSON 导入**（全部四个订阅渠道）——上传或粘贴已有的 OAuth JSON， 不需要在这台机器上完成本地回调

导入支持 CPA 兼容、官方 Codex、官方 Claude Code 及 sub2api OAuth JSON，可上传多文件或账号数组；不支持 PAT 或缺少必要刷新凭据的文件。

订阅分组可设置自定义 HTTPS 上游根地址或路径前缀，代理需承接对应渠道的调用、模型发现与额度查询，不会隐式回退官方业务地址。OAuth 授权与 Token 刷新仍使用官方端点。

## 回调端口<a href="#ports" class="anchor" aria-label="复制本节链接">§</a>

走本地回调的三个渠道，端口是**上游客户端写死的**，不能自定义：

<div class="tbl-wrap">

| 渠道        | 回调端口 | 说明                                         |
|-------------|----------|----------------------------------------------|
| Codex       | 1455     | 回调地址 http://localhost:1455/auth/callback |
| Claude      | 54545    | 由上游客户端固定                             |
| Antigravity | 51121    | 由上游客户端固定                             |
| Grok        | 不需要   | 设备码授权，不占用本机端口                   |

</div>

Docker Compose 默认会把这三个端口发布出来，和主服务一样**只绑定到 127.0.0.1**：

<div class="code-wrap">

<div class="code-cap">

<span class="label">docker-compose.yml 中的端口发布</span>

</div>

<div class="code-box">

ports:\
  - <span class="s">"\$\${BIND_ADDRESS:-\${HOST:-127.0.0.1}}:\$\${PORT:-3001}:\$\${PORT:-3001}"</span>\
  - <span class="s">"\$\${OAUTH_CALLBACK_BIND_ADDRESS:-...}:1455:1455"</span>   <span class="c">\# Codex</span>\
  - <span class="s">"\$\${OAUTH_CALLBACK_BIND_ADDRESS:-...}:54545:54545"</span> <span class="c">\# Claude</span>\
  - <span class="s">"\$\${OAUTH_CALLBACK_BIND_ADDRESS:-...}:51121:51121"</span> <span class="c">\# Antigravity</span>

复制

</div>

</div>

<div class="notice notice-amber">

<span class="t">回调端口只限制本地授权</span>

因为端口由上游固定、无法更改，一台主机上同一时刻只能有一个默认 Compose 实例使用本地回调授权。其他实例可导入已有 OAuth JSON；Grok 也可使用设备码。

</div>

## 远程部署怎么授权<a href="#remote" class="anchor" aria-label="复制本节链接">§</a>

这是最容易卡住的一步。服务跑在远程服务器上时，**你浏览器里的 `localhost` 指向的是你自己的电脑，不是服务器**， 授权完成后跳转会失败。

解决办法有三种，任选其一：

1.  **手动粘贴回调地址**——授权页面跳转失败后， 把浏览器地址栏里那串完整的回调 URL 复制出来，粘贴回管理台的回调输入框。 网关会从中取出授权码完成流程。**这是最通用的做法**， 不需要改任何网络配置。
2.  **SSH 端口转发**——把服务器的回调端口映射到本机， 让 `localhost` 真的能通到服务器：

<div class="code-wrap">

<div class="code-cap">

<span class="label">SSH 端口转发（以 Codex 为例）</span>

</div>

<div class="code-box">

ssh -L 1455:127.0.0.1:1455 user@your-server\
\
<span class="c">\# Claude 用 54545，Antigravity 用 51121</span>\
<span class="c">\# 转发保持连接期间完成授权即可</span>

复制

</div>

</div>

已有 OAuth JSON 时，直接上传或粘贴导入即可，不需要回调端口。

<div class="notice notice-amber">

<span class="t">不要为了授权开放公网</span>

回调端口不应该暴露到公网。可以手动粘贴回调、使用 SSH 转发，或导入已有 OAuth JSON；无需把 OAUTH_CALLBACK_BIND_ADDRESS 改为 0.0.0.0。

</div>

## 四种授权状态<a href="#state" class="anchor" aria-label="复制本节链接">§</a>

每个订阅账号都有一个授权状态，排障时先看它：

<div class="tbl-wrap">

| 状态 | 含义 | 该怎么做 |
|----|----|----|
| 就绪 | 凭据有效，正常参与调度 | 无需处理 |
| 刷新中 | 网关正在刷新凭据 | 等待即可，通常几秒完成 |
| 需重新授权 | 上游拒绝刷新，或现有授权已失效 | 尝试刷新凭据；仍失败时重新连接或导入 |
| 结果未知 | 刷新请求没拿到明确结果，可能是网络问题 | 尝试刷新凭据；仍失败时重新连接或导入 |

</div>

「刷新凭据」在账号卡片的更多菜单中，用于恢复授权；「刷新额度」只更新额度信息。 手动停用的账号需先启用，才能刷新凭据。

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fsub-02-accounts.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fsub-02-accounts.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="订阅账号凭据列表，展示账号状态、额度窗口和重置时间" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>额度窗口、重置时间、授权状态在同一屏内可见。</p>
<figcaption><span class="label">FIG. 2 — 账号列表</span><span class="label">状态 · 额度 · 重置时间</span></figcaption>
</figure>

## 额度信息怎么读<a href="#quota" class="anchor" aria-label="复制本节链接">§</a>

首次导入后点击「刷新额度」获取当前额度和重置时间； 升级后额度未更新或显示异常，也可主动刷新一次。

<div class="notice notice-blue">

<span class="t">额度只作展示</span>

**额度信息不参与调度决策。**它通过主动同步并结合上游响应更新， 存在延迟，也不一定覆盖所有计费维度。**真正触发账号切换的是上游返回的限流响应**—— 当某个账号被限流，网关会立即让它冷却并换用其他账号， 不管此时显示的额度是多少。

</div>

所以额度那栏的用途是**让你判断要不要再加账号**， 而不是用来预测网关下一次会选谁。想确认是否有候选分组和可用凭据，用 [监控与排障](/docs/monitor) 里的路由检查。

<div class="notice notice-blue">

<span class="t">Codex 的重置额度</span>

仅 Codex 账号可能显示可用的重置额度。它需要在管理台手动消费，不参与自动调度；操作后等待额度信息刷新确认结果。

</div>

## 使用前提<a href="#rule" class="anchor" aria-label="复制本节链接">§</a>

- **只接你有权使用的账号**，并遵守各服务商的订阅条款。 共享或转售订阅额度通常是违规的。
- 订阅渠道依赖上游的 OAuth 与兼容协议，**上游改动时可能需要跟随更新**，这类变化不在网关的控制范围内。
- 凭据在本地加密存储，但**能解密它的密钥和数据库必须一起备份**， 见 [安全与上生产](/docs/security)。

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">分组与渠道</span>](/docs/groups)<a href="/docs/models" class="next"><span class="k">下一页 →</span><span class="t">模型管理</span></a>

</div>

</div>
