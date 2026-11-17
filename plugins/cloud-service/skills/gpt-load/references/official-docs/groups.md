<!-- Source: https://www.gpt-load.com/docs/groups?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 配置</span>

</div>

# 分组与渠道

分组是对接上游的全部配置：用哪个服务、拿哪些凭据、开放哪些模型、按什么策略跑。

<div class="docs-rule">

</div>

<div class="prose">

## 分组是什么<a href="#what" class="anchor" aria-label="复制本节链接">§</a>

一个分组对应**一个上游服务**，里面装着一池凭据。 网关收到请求后，在这池凭据里挑一个可用的发出去；某个凭据限流或失效， 会自动避开它用别的，不需要你介入。

分组和访问密钥的分工见 [核心概念](/docs/concepts)。 简单说：**分组朝上游，访问密钥朝应用**。

## 24 个内置渠道<a href="#channels" class="anchor" aria-label="复制本节链接">§</a>

建分组时从这些里选一个。常用渠道直接显示为按钮，其余渠道收在「其他渠道」中。 不同类别的凭据形态不一样：

<div class="tbl-wrap">

| 类别 | 渠道 | 凭据形态 |
|----|----|----|
| 官方 API | OpenAI · Anthropic · Gemini · xAI | API 密钥 |
| 云平台 | Azure OpenAI · AWS Bedrock · Google Vertex AI | 平台凭据（AK/SK 或服务账号） |
| 模型服务 | DeepSeek · Moonshot AI · SiliconFlow · 智谱 AI · 阿里云 · 火山引擎 · OpenRouter · Groq | API 密钥 |
| 订阅账号 | Codex · Claude · Antigravity · Grok | OAuth 授权 |
| 网关与兼容 | GPT-Load · New API · CLIProxyAPI · Sub2API · OpenAI Compatible | API 密钥 + 网关根地址 |

</div>

每个渠道会声明自己**能执行哪些协议和能力**。 网关在支持的能力之间做转换，但它不是万能翻译器——边界见 [协议与转换边界](/docs/internals/protocols)。

[查看逐渠道支持矩阵 →](/docs/reference/support-matrix)

## 建一个分组<a href="#create" class="anchor" aria-label="复制本节链接">§</a>

点**分组 → 新建分组**。 要填的核心只有三样：渠道、凭据、模型。

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fgrp-01-list.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fgrp-01-list.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="分组列表，展示多个分组的状态、渠道、模型数量和凭据状态" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>接几个上游就建几个分组。同一个服务商的多把密钥不用拆，放同一个分组里即可。</p>
<figcaption><span class="label">FIG. 1 — 分组列表</span><span class="label">每个分组一个上游</span></figcaption>
</figure>

## 渠道参数<a href="#params" class="anchor" aria-label="复制本节链接">§</a>

选定渠道后，表单会出现这个渠道特有的参数。常见的几种：

- **接口地址**——官方渠道有默认值，用中转或自建服务时才需要改
- **网关根地址**——GPT-Load、New API、CLIProxyAPI、Sub2API 填根地址或部署前缀， 不要附加 `/v1`、`/v1beta` 或查询参数
- **区域**——AWS Bedrock、Google Vertex AI 这类云平台要指定区域
- **部署名**——Azure OpenAI 的模型部署标识

填错这些通常表现为请求全部失败。遇到时用 [监控与排障](/docs/monitor) 里的路由检查， 能看出哪些分组进入候选，以及当前有多少可用凭据。

## 管理凭据池<a href="#creds" class="anchor" aria-label="复制本节链接">§</a>

凭据池是分组的核心。**放几把密钥，网关就在几把之间轮转**， 单把出问题不会影响整体。

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fgrp-02-credentials.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fgrp-02-credentials.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="分组凭据页，展示多条凭据及可用、冷却和停用等状态统计" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>顶部按状态分类统计。可用的参与轮转，冷却中的暂时跳过，拉黑的已被自动摘除。</p>
<figcaption><span class="label">FIG. 2 — 凭据池</span><span class="label">多条凭据 · 不同状态</span></figcaption>
</figure>

凭据可以做这些操作：

- **批量导入**——在分组的凭据页打开导入面板， 一次粘贴多把密钥，每行一个
- **启用／停用**——停用后不参与轮转，但保留在池子里
- **单条权重**——让某把密钥承担更多或更少流量
- **测试连接**——用这一条凭据发一次最小的真实上游请求， 当场看它还能不能用
- **查看真实值**——凭据加密存储，需要时可以显式查看
- **单独设代理**——某把密钥需要走不同出口时用，见 [代理与请求头](/docs/advanced/proxy-and-headers)

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fgrp-05-import.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fgrp-05-import.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="导入渠道凭据的已有分组页，显示目标分组和多行 API 密钥输入区" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>重复的密钥会被自动识别并跳过，可以放心整段粘贴。</p>
<figcaption><span class="label">FIG. 3 — 批量导入</span><span class="label">一行一个密钥</span></figcaption>
</figure>

<div class="notice notice-amber">

<span class="t">测试连接会真的花钱（一点点）</span>

测试**发的是真实上游请求**，会产生少量费用。 它**不改变调度或拉黑状态**，所以可以放心用来确认「这把密钥到底还有没有效」。\
结果有三种：**测试通过**、**测试未通过**（会说明是密钥无效、 上游限流还是模型不可用），以及**暂时无法判断**—— 最后这种通常是超时或该渠道不支持探测，不代表密钥有问题。\
如果测的这把凭据当前正被拉黑，测试通过后会直接问你要不要恢复它， 不用再去健康页操作一遍。

</div>

## 开放哪些模型<a href="#models" class="anchor" aria-label="复制本节链接">§</a>

分组要声明它对外提供哪些模型。可以从上游**自动发现**， 也可以手工添加。

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fgrp-03-models.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fgrp-03-models.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="分组的模型与别名表格，展示模型 ID、对外别名和定价状态" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>只有列在这里的模型，才能通过这个分组被请求到。</p>
<figcaption><span class="label">FIG. 4 — 模型与别名</span><span class="label">发现 · 手工添加 · 别名</span></figcaption>
</figure>

模型别名就在同一张表里配置；价格与成本估算见 [模型管理](/docs/models)。

## 运行策略<a href="#policy" class="anchor" aria-label="复制本节链接">§</a>

设置标签页里是这个分组的运行参数：权重、超时、拉黑阈值、 会话亲和、出站代理与参数覆盖规则。

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fgrp-04-settings.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fgrp-04-settings.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="分组设置页，展示权重、超时、重试及继承系统默认值的配置项" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>支持继承的参数可启用覆盖，或恢复系统默认；保存后生效。</p>
<figcaption><span class="label">FIG. 5 — 分组设置</span><span class="label">覆盖系统级默认值</span></figcaption>
</figure>

各参数分别调什么、什么场景下该改，见 [运行时设置](/docs/settings)。

「参数覆盖规则」可按客户端协议和模型匹配，模型支持精确匹配或末尾 \* 前缀匹配。 命中的规则依次执行，每条先删除指定 JSON 路径，再合并设置；后面的规则覆盖前面的值。 对象递归合并，数组整体替换，null 是普通值。

参数覆盖用于生成、Embeddings 与 Rerank 请求，不作用于图片编辑、Token 统计、Responses 资源操作或探测；不能修改根级 model、stream、store，也不能注入或改写 previous_response_id。

## 自定义渠道<a href="#custom" class="anchor" aria-label="复制本节链接">§</a>

要接的服务不在内置列表里，但兼容 OpenAI 接口？选 **OpenAI Compatible**， 自己填接口地址和密钥即可。各类中转服务、自建的推理服务都走这个。

## 什么时候该拆分组<a href="#split" class="anchor" aria-label="复制本节链接">§</a>

**该拆的情况：**

- 对接不同的上游服务——这是硬性的，一个分组只能选一个渠道
- 同一服务商，但两批密钥要用不同策略（比如一批主用、一批兜底）
- 同一服务商，但要开放给不同应用的模型范围不同

**不用拆的情况：**同一个服务商的多把密钥。 直接放进一个池子，网关自己会轮转和避让，拆开反而失去了互为备份的效果。

<div class="notice notice-blue">

<span class="t">订阅账号</span>

Codex、Claude、Antigravity、Grok 这类账号走的是 OAuth 授权而不是填密钥， 配置方式有额外的注意事项（尤其是回调端口和远程部署），见 [订阅账号](/docs/groups/subscription)。

</div>

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">已知限制与版本策略</span>](/docs/known-limitations)<a href="/docs/groups/subscription" class="next"><span class="k">下一页 →</span><span class="t">订阅账号</span></a>

</div>

</div>
