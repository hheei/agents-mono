<!-- Source: https://www.gpt-load.com/docs/access-keys?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 配置</span>

</div>

# 访问密钥

访问密钥是你交给应用的那串字符。它不绑定任何上游，只声明应用能访问哪些资源、从哪里访问，以及能用多少。

<div class="docs-rule">

</div>

<div class="prose">

## 它管什么<a href="#what" class="anchor" aria-label="复制本节链接">§</a>

分组朝上游，**访问密钥朝应用**。应用拿到一把密钥， 不需要知道背后有几个分组、几十把上游凭据。

一把密钥声明四类边界：

- **资源范围**——能用哪些分组和客户端模型
- **协议范围**——能用哪些客户端协议
- **访问条件**——允许的来源 IP/CIDR 和有效期
- **用量边界**——每分钟请求数，以及成本封顶

因为有这层隔离，**给不同应用发不同的密钥**就变得很自然： 各自限额、各自吊销，互不影响。

<div class="notice notice-blue">

<span class="t">也可以登录只读管理台</span>

启用且未过期的访问密钥可以直接登录当前实例， 但只能查看自身范围内的首页、模型、用量和脱敏请求日志。 它不能修改分组、访问密钥或运行时设置，也不能查看上游凭据。

</div>

## 创建一把密钥<a href="#create" class="anchor" aria-label="复制本节链接">§</a>

密钥值可自定义或随机生成。创建时留空由系统生成，编辑时留空保留原值；随机生成只更新草稿，保存后才生效。

点**访问密钥 → 新建**，勾选可用分组和协议， 按需设置限额，保存后会生成密钥串。

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fkey-01-list.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fkey-01-list.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="访问密钥列表，展示密钥状态、授权分组、协议范围和用量限额" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>密钥创建后只显示掩码，需要时可以显式查看真实值。</p>
<figcaption><span class="label">FIG. 1 — 访问密钥列表</span><span class="label">授权范围 · 限额 · 状态</span></figcaption>
</figure>

<div class="notice notice-amber">

<span class="t">保存好它</span>

密钥是应用访问网关的唯一凭证。**不要提交到仓库、日志或公开 issue**， 也不要在多个应用之间共用同一把——共用会让你无法单独吊销其中一个。

</div>

## 授权范围<a href="#scope" class="anchor" aria-label="复制本节链接">§</a>

一把密钥可以授权多个分组，也可以按**客户端看到的模型名**进一步收窄。 请求进来时，**网关按请求里的模型名和分组的健康状况决定实际走哪个**。

这带来一个实用效果：

- **同模型多来源**——若两个分组都开放了同一个模型， 一个不可用时会自动走另一个，应用无感
- **按需收窄**——只授权应用真正需要的分组和模型， 避免它意外使用其他资源

<div class="notice notice-blue">

<span class="t">留空表示不限制</span>

分组、协议或模型列表留空，表示该维度不限制；填写多个值时，任意一个匹配即可。 不同维度之间则必须同时满足。

</div>

## 协议选择<a href="#proto" class="anchor" aria-label="复制本节链接">§</a>

勾选这把密钥允许的客户端协议。没勾的协议，用这把密钥请求会被拒绝。

- **OpenAI Chat Completions**——最通用，绝大多数兼容客户端走这条
- **OpenAI Responses**——较新的接口形态，支持有状态请求
- **Anthropic Messages**——Claude Code 等客户端的原生入口
- **Gemini**——Gemini 客户端的原生入口

拿不准就把应用会用到的都勾上。协议之间的能力差异见 [协议与转换边界](/docs/internals/protocols)。

## 来源与有效期<a href="#source" class="anchor" aria-label="复制本节链接">§</a>

还可以给访问密钥增加两个认证条件：

- **来源 IP/CIDR**——留空表示不限来源；填写后，只允许匹配的 IPv4、IPv6 或 CIDR
- **有效期**——可设为永不过期或指定未来时间；到期后，新请求和只读管理台登录都会被拒绝

<div class="notice notice-amber">

<span class="t">反向代理看到的是直接来源</span>

来源限制匹配的是与 GPT-Load 直接建立连接的地址，不读取`X-Forwarded-For` 或 `X-Real-IP`。 经过反向代理时，通常应允许代理服务器地址，而不是终端用户地址。

</div>

## 限流<a href="#rpm" class="anchor" aria-label="复制本节链接">§</a>

**每分钟请求数（RPM）**限制这把密钥的调用频率， 超出的请求会被拒绝。留空或设为 0 表示不限制。

它的作用是**防止单个应用失控**—— 比如某个脚本写错了循环，不至于把所有上游额度耗光。

## 成本上限<a href="#cost" class="anchor" aria-label="复制本节链接">§</a>

它按网关计算的估算成本限制后续请求，支持两种规则：

- **总额度**——累计估算成本达到阈值后拒绝后续请求，不会重置。 适合发给外部协作者的一次性密钥
- **周期额度**——每个周期重新计数，周期长度可配 （从一分钟到一年）。常用的是按天或按月

成本限额累计的是乘以分组和访问密钥价格倍率后的最终费用；两层倍率默认均为 1。

<div class="notice notice-amber">

<span class="t">这是软保护，不是硬预算</span>

网关在请求完成后才把本次估算成本计入额度。单次大请求和已经放行的并发请求可能让累计金额超过阈值；没有价格或用量数据的请求也不会计入。它适合防止意外失控，不等于服务商账单或严格财务上限。

</div>

[查看成本限制边界 →](/docs/known-limitations#cost)

[查看成本估算口径 →](/docs/monitor)

## 停用与轮换<a href="#rotate" class="anchor" aria-label="复制本节链接">§</a>

密钥有**启用 / 停用**两种状态。停用后立即失效， 但配置保留着，随时可以再启用——排查某个应用的问题时很方便。

在编辑密钥时填写新值或随机生成，再保存即可更换密钥；原 ID、权限、额度设置及已用金额保留。 保存成功后旧密钥立即失效，已经开始的请求不受影响；没有双密钥宽限期。

如果要求**零停机轮换**，仍应新建第二把密钥、更新并验证应用， 然后再停用或删除旧密钥。

## 实践建议<a href="#practice" class="anchor" aria-label="复制本节链接">§</a>

- **一个应用一把密钥。**共用会让你既看不清是谁在用量， 也没法单独吊销
- **给测试环境单独发一把，并设较低的成本上限。**调试时的意外循环最容易烧额度
- **授权范围按需给。**只读的演示应用没必要授权到贵模型的分组
- **外部或临时应用设置来源限制和过期时间。**泄漏后的可用范围会更小
- **发给外部的密钥用总额度封顶。**比周期额度更可控

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">模型管理</span>](/docs/models)<a href="/docs/clients" class="next"><span class="k">下一页 →</span><span class="t">客户端接入</span></a>

</div>

</div>
