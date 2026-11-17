<!-- Source: https://www.gpt-load.com/docs/reference/support-matrix?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 参考</span>

</div>

# 渠道与能力支持矩阵

逐渠道核对凭据类型、客户端协议、Operation、路由模式、模型发现与托管代理。

<div class="docs-rule">

</div>

<div class="prose">

## 口径与版本<a href="#scope" class="anchor" aria-label="复制本节链接">§</a>

本页描述 GPT-Load 已声明的路由能力，不代表任意模型或上游都支持该能力。

矩阵核对基于 GPT-Load 主分支提交 e9a10bb5，核对日期为 2026-09-18。具体能力以所用版本为准。

<div class="notice notice-blue">

<span class="t">读表方式</span>

N 表示 Native，按目标协议原生执行；C 表示 Converted，由网关转换；N/C 表示按模型决定；N\* 表示仅原生支持 Compact；— 表示当前没有声明该路由。

</div>

## 凭据与核心协议<a href="#core" class="anchor" aria-label="复制本节链接">§</a>

<div class="tbl-wrap">

| 渠道 | 凭据 | Chat Completions | Responses Create | Anthropic Messages | Gemini Generate |
|----|----|----|----|----|----|
| OpenAI | API 密钥 | N | N | C | C |
| Codex | OAuth / OAuth JSON | C | N | C | C |
| Claude | OAuth / OAuth JSON | C | C | N | C |
| Antigravity | OAuth / OAuth JSON | C | C | C | N |
| Grok | 设备码 / OAuth JSON | C | N | C | C |
| Anthropic | API 密钥 | C | C | N | C |
| Google Gemini | API 密钥 | C | C | C | N |
| Azure OpenAI | API 密钥 / Entra | C | C | C | C |
| AWS Bedrock | Bedrock API Key / AWS 凭据 | C | C | C | C |
| Google Vertex AI | 服务账号 JSON | C | C | C | N/C |
| DeepSeek | API 密钥 | N | N | N | C |
| Moonshot AI | API 密钥 | N | C | C | C |
| SiliconFlow | API 密钥 | N | C | C | C |
| Zhipu AI | API 密钥 | N | C | C | C |
| Alibaba Cloud Bailian | API 密钥 | N | C | C | C |
| Volcengine Ark | API 密钥 | N | C | C | C |
| OpenRouter | API 密钥 | N | N | C | C |
| Groq | API 密钥 | N | C | C | C |
| xAI | API 密钥 | N | N | C | C |
| GPT-Load | AccessKey + 根地址 | N | N | N | N |
| New API | API 密钥 + 根地址 | N | N | N | N |
| CLIProxyAPI | API 密钥 + 根地址 | N | N | N | N |
| Sub2API | API 密钥 + 根地址 | N | N | N | N |
| OpenAI Compatible | API 密钥 + 自填地址 | N | C | C | C |

</div>

路由模式按协议和 Operation 分别声明；同一个渠道可以同时包含 Native 与 Converted。

## 附加 Operation<a href="#operations" class="anchor" aria-label="复制本节链接">§</a>

<div class="tbl-wrap">

| 渠道 | Images 生成/编辑 | Embeddings | Anthropic CountTokens | Gemini CountTokens | Responses Input Tokens | Responses 资源接口 | 模型发现 | 托管代理 |
|----|----|----|----|----|----|----|----|----|
| OpenAI | N | N | C | C | N | N | ✓ | ✓ |
| Codex | N | — | C | C | N | — | ✓ | ✓ |
| Claude | — | — | N | C | C | — | ✓ | ✓ |
| Antigravity | C | — | C | N | C | — | ✓ | ✓ |
| Grok | — | — | C | C | N | — | ✓ | ✓ |
| Anthropic | — | — | N | C | C | — | ✓ | ✓ |
| Google Gemini | C | — | C | N | C | — | ✓ | ✓ |
| Azure OpenAI | — | — | — | — | — | — | ✓ | — |
| AWS Bedrock | — | — | — | — | — | — | ✓ | — |
| Google Vertex AI | — | — | — | — | — | — | ✓ | — |
| DeepSeek | — | — | — | — | — | — | ✓ | ✓ |
| Moonshot AI | — | — | — | — | — | — | ✓ | ✓ |
| SiliconFlow | — | — | — | — | — | — | ✓ | ✓ |
| Zhipu AI | — | — | — | — | — | — | ✓ | ✓ |
| Alibaba Cloud Bailian | — | — | — | — | — | — | ✓ | ✓ |
| Volcengine Ark | — | — | — | — | — | — | ✓ | ✓ |
| OpenRouter | — | N | — | — | — | — | ✓ | ✓ |
| Groq | — | — | — | — | — | — | ✓ | ✓ |
| xAI | — | — | — | — | — | — | ✓ | ✓ |
| GPT-Load | N | N | N | N | N | N | ✓ | ✓ |
| New API | N | N | — | — | — | N\* | ✓ | ✓ |
| CLIProxyAPI | N | — | N | N | — | N\* | ✓ | ✓ |
| Sub2API | N | — | N | N | — | N\* | ✓ | ✓ |
| OpenAI Compatible | N | N | — | — | — | — | ✓ | ✓ |

</div>

Images 的 N 表示原生生成与编辑；C 表示 Gemini 与 Antigravity 仅支持单张、非流式、Base64 图片生成转换，不含编辑。Responses 资源接口包括查询、删除、取消、输入项、压缩及命名空间透传。

纯文本 Rerank 由 OpenAI Compatible、New API、GPT-Load 原生支持，入口为 POST /v1/rerank；不支持流式或协议互转，访问密钥需允许 rerank 协议。

模型发现指管理端使用凭据发现上游模型；数据面的模型列表返回当前 AccessKey 可见的已配置模型，不会实时查询上游。

托管代理指 GPT-Load 在凭据、分组或全局层注入的代理；Provider SDK 自行读取环境变量不属于这个合同。

## 验证等级<a href="#validation" class="anchor" aria-label="复制本节链接">§</a>

<div class="tbl-wrap">

| 等级 | 含义 | 当前公开证据 |
|----|----|----|
| Automated contract | 渠道声明、RouteMode、适配器能力与自动化测试一致 | 覆盖本页列出的 24 个渠道路由合同 |
| Artifact smoke | 真实发布二进制或镜像走完整产品路径，但上游可以是受控替身 | 发布镜像覆盖 OpenAI Compatible Chat 到 fake upstream |
| Live upstream verified | 指定版本、渠道、Operation 和模型使用真实凭据完成验证 | 当前没有集中发布、可逐项追溯的 24 渠道 Live E2E 记录 |

</div>

<div class="notice notice-amber">

<span class="t">实现支持不等于真实上游已验证</span>

上游会改变接口、模型与账号政策。没有版本、日期、Operation、模型和证据链接的验证记录，不标记为 Live upstream verified。

</div>

## 已知限制<a href="#limits" class="anchor" aria-label="复制本节链接">§</a>

- OpenAI Compatible 的真实能力取决于你填写的中转服务；矩阵只说明 GPT-Load 能构造和接收哪些请求。
- Google Vertex AI 的 Gemini 路由按模型决定 Native 或 Converted。
- 协议路由不代表模型一定支持 tools、reasoning、视觉或其他模型级特性。
- Azure OpenAI、AWS Bedrock 与 Google Vertex AI 不支持 GPT-Load 托管代理。

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">代理与请求头</span>](/docs/advanced/proxy-and-headers)<a href="/docs/reference/env" class="next"><span class="k">下一页 →</span><span class="t">环境变量</span></a>

</div>

</div>
