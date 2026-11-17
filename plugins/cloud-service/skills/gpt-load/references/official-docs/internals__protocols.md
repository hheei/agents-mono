<!-- Source: https://www.gpt-load.com/docs/internals/protocols?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 深入</span>

</div>

# 协议与转换边界

网关能在协议之间转换，但不是万能翻译器。这一页说明边界在哪，以及遇到不支持的组合时会怎样。

<div class="docs-rule">

</div>

<div class="prose">

## 四种协议<a href="#four" class="anchor" aria-label="复制本节链接">§</a>

GPT-Load 接受四种客户端协议。它们是**并列关系**， 一把访问密钥可以同时允许多个：

- **OpenAI Chat Completions**——最通用， 绝大多数兼容客户端和第三方服务都走这条
- **OpenAI Responses**——较新的接口形态， 支持有状态的多轮接续
- **Anthropic Messages**——Claude 系客户端的原生入口
- **Gemini**——Gemini 系客户端的原生入口

<div class="notice notice-blue">

<span class="t">OpenAI 是两个协议</span>

Chat Completions 和 Responses 是**两个独立协议**，不是一个的新旧版本。 管理台里选「OpenAI」预设时会同时勾上这两个，但它们各自有独立的入口和能力。

</div>

## 接口入口<a href="#entry" class="anchor" aria-label="复制本节链接">§</a>

客户端按各自协议的习惯访问，不需要在路径里带分组名：

<div class="tbl-wrap">

| 协议                    | 主要入口                   |
|-------------------------|----------------------------|
| OpenAI Chat Completions | /v1/chat/completions       |
| OpenAI Responses        | /v1/responses 及其资源路径 |
| Anthropic Messages      | /v1/messages               |
| Gemini                  | /v1beta/models/…           |

</div>

除对话外，还提供这些接口（可用性取决于上游渠道）：

- **模型列表**——`/v1/models` 与 `/v1beta/models`
- **向量嵌入**——`/v1/embeddings`
- **图片生成与编辑**——`/v1/images/generations`、`/v1/images/edits`
- **token 计数**——`/v1/messages/count_tokens` 及 Gemini 的 `countTokens`

GET /v1/models 携带非空 anthropic-version 请求头时返回 Anthropic 模型列表；否则返回 OpenAI Chat Completions 格式。直接调接口时按客户端协议带上对应请求头。

[查看逐渠道协议与 Operation →](/docs/reference/support-matrix)

## 转换是怎么发生的<a href="#convert" class="anchor" aria-label="复制本节链接">§</a>

客户端用的协议，和上游渠道支持的协议**不一定相同**。 比如你用 Claude Code（Anthropic 协议）请求一个 OpenAI 渠道的模型—— 网关会把请求转成 OpenAI 格式发出去，再把响应转回 Anthropic 格式。

这个转换对客户端是透明的。**请求日志里能看到转换过程**， 排查响应格式异常时先看这里，见 [监控与排障](/docs/monitor)。

**协议相同时不发生转换**，请求基本原样透传—— 这也是延迟最低、兼容性最好的路径。

## 不能转换的情况<a href="#limit" class="anchor" aria-label="复制本节链接">§</a>

<div class="notice notice-amber">

<span class="t">它不是万能翻译器</span>

每个渠道**声明自己能执行哪些协议与能力**。网关只在这些声明的能力之间转换， 不会尝试把任意协议、任意 JSON 强行翻译成另一种。

</div>

常见的转换失败场景：

- **目标渠道不支持该能力**—— 比如向一个纯文本模型请求图片生成
- **协议特有的参数没有对应物**—— 某些参数只存在于一种协议里，转换时会被丢弃或报错
- **模型本身不支持**—— 比如对不支持视觉的模型发送图片输入

遇到这类问题，**最直接的解法是让客户端协议和渠道协议对齐**： 用 Claude 客户端就配 Anthropic 渠道，减少中间转换。

## 有状态请求<a href="#stateful" class="anchor" aria-label="复制本节链接">§</a>

OpenAI Responses 支持靠 `previous_response_id`、`conversation` 或已有资源 ID 接续上下文。 这类请求有个前提：

<div class="notice notice-amber">

<span class="t">响应续接使用原凭据</span>

对支持上游存储的原生 HTTP/SSE Responses，网关记录返回的响应 ID。使用同一访问密钥携带 previous_response_id 时，只使用当前仍允许的原凭据，不受软亲和开关影响，也不会因失败换号。

</div>

转换或无状态响应、明确 store:false 的新响应不会登记；未知、过期或淘汰的 ID 会在本地拒绝，包括网关外或升级前创建的 ID。仅正常停机成功保存后可恢复绑定，不保证崩溃恢复。

conversation 和其他资源操作仍不保证回到原凭据；请使用单凭据分组，或确认上游支持跨凭据共享。中转渠道只保证回到原下一跳。

GET /v1/responses 支持原生 WebSocket，当前适用于 OpenAI、Codex、xAI、GPT-Load、CLIProxyAPI、Sub2API。连接固定上游 Session，Codex 仅支持原连接内续接；不提供 WS→HTTP 转换，也不保证重连恢复上下文。开关见运行时设置。

另一个选择是**不用有状态接口**—— 每次把完整上下文发过去。这样任何凭据都能处理， 调度也更均衡，代价是每次请求的输入 token 更多。

## 该用哪个协议<a href="#pick" class="anchor" aria-label="复制本节链接">§</a>

没有绝对的优劣，按情况选：

- **客户端已经定了**——用它原生的那个，转换最少。 Claude Code 就用 Anthropic，Gemini CLI 就用 Gemini
- **自己写代码**——Chat Completions 兼容性最广， 换上游最省事
- **需要有状态接续**——Responses； 注意响应 ID 续接与其他资源引用的不同边界

访问密钥里**可以同时勾选多个协议**， 不确定就都勾上，用不到的协议不会有副作用。 配置见 [访问密钥](/docs/access-keys)。

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">调度是怎么做的</span>](/docs/internals/scheduling)<a href="/docs/advanced/proxy-and-headers" class="next"><span class="k">下一页 →</span><span class="t">代理与请求头</span></a>

</div>

</div>
