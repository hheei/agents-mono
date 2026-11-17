<!-- Source: https://www.gpt-load.com/docs/concepts?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 开始使用</span>

</div>

# 核心概念

管理台里只有两个需要你操心的东西：分组和访问密钥。搞清它们各管什么，其余文档都好读了。

<div class="docs-rule">

</div>

<div class="prose">

## 只有两层<a href="#two" class="anchor" aria-label="复制本节链接">§</a>

很多网关会让你分别管理「服务商」「密钥」「路由规则」。GPT-Load 把它们压成了两层：

- **分组**——对接上游的一切：用哪个服务、拿哪些凭据、开放哪些模型、按什么策略跑
- **访问密钥**——发给应用的东西：能用哪些分组、能用哪些协议、限额多少

一句话概括：**分组朝上游，访问密钥朝应用**。中间的调度、重试、冷却、计费统计， 网关自己完成，两边都不用管。

## 分组：朝上游的那一半<a href="#group" class="anchor" aria-label="复制本节链接">§</a>

一个分组把五件事绑在一起：

1.  **渠道**——从内置的 24 个上游里选一个，决定请求最终发到哪
2.  **接入方式**——用 API 密钥，还是用订阅账号授权
3.  **凭据池**——一个或多个密钥／账号，网关在它们之间轮转
4.  **可用模型**——这个分组对外开放哪些模型
5.  **运行策略**——权重、超时、重试次数、冷却阈值、出站代理

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fcpt-01-group-tabs.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fcpt-01-group-tabs.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="分组详情页，顶部显示凭据、模型与别名、设置三个标签页" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>一个分组的全部内容就在这三个标签页里：凭据池、模型与别名、运行策略。</p>
<figcaption><span class="label">FIG. 1 — 分组详情</span><span class="label">凭据 · 模型与别名 · 设置</span></figcaption>
</figure>

## 渠道不是单独建的<a href="#channel" class="anchor" aria-label="复制本节链接">§</a>

<div class="notice notice-amber">

<span class="t">容易找不到</span>

管理台里**没有「渠道」这个菜单**。渠道是在「分组 → 新建分组」中选择的—— 常用渠道直接显示为按钮，其余渠道在「其他渠道」里。选完 OpenAI 或 Anthropic， 这个分组就固定对接那个上游了。 想接两个不同的服务商，就建两个分组。

</div>

这么设计是因为：换服务商往往意味着凭据、可用模型、限流特征全都变了， 与其让你在三个地方分别改，不如让一个分组从头到尾对应一个上游。

## 两种接入方式，同一套调度<a href="#conn" class="anchor" aria-label="复制本节链接">§</a>

建分组时要选接入方式，它决定凭据长什么样：

- **API 密钥**——粘贴一串或多串密钥，最常见的方式
- **订阅账号**——走 OAuth 授权，用于 Codex、Claude、Antigravity、Grok 这类按订阅计费的账号

两者**共用同一套调度、重试、冷却和健康隔离**。也就是说， 你不需要为订阅账号单独维护一套运维逻辑，它们在网关眼里都只是「一池凭据」。 订阅账号的授权细节见 [订阅账号](/docs/groups/subscription)。

## 访问密钥：朝应用的那一半<a href="#key" class="anchor" aria-label="复制本节链接">§</a>

访问密钥是你交给应用的那串字符。它**不直接绑定任何上游**， 只声明三件事：

- **能用哪些分组**——可以选多个，网关按模型和健康状况决定实际走哪个
- **能用哪些协议**——OpenAI Chat Completions、Responses、Anthropic Messages、Gemini
- **限额**——每分钟请求数，以及成本上限（可以是不重置的总额度， 也可以是按周期重置的额度）

因为这层隔离，给不同应用发不同的密钥就变得很自然： 测试环境一把、生产一把、给同事一把，各自限额、各自吊销，互不影响。 细节见 [访问密钥](/docs/access-keys)。

## 分组不出现在 URL 里<a href="#url" class="anchor" aria-label="复制本节链接">§</a>

<div class="notice notice-amber">

<span class="t">与 1.x 的差异</span>

1.x 需要把分组名拼进请求地址。**2.0 不需要**——应用只认一个固定的基础 URL， 用哪个分组由访问密钥的授权范围和请求里的模型名共同决定。

</div>

这意味着切换上游对应用是**完全无感的**：你在管理台里改分组配置、 增删凭据、甚至换一家服务商，应用那边的地址和密钥都不用动。

## 该建几个分组<a href="#how" class="anchor" aria-label="复制本节链接">§</a>

没有标准答案，但有两条实用的判断：

- **按上游分**——这是硬性的，一个分组只能对接一个渠道
- **按策略分**——同一个服务商，如果你想让一批密钥走高优先级、另一批做兜底， 或者两批密钥的超时和拉黑阈值要求不同，那就拆成两个分组

反过来，**同一个服务商的多把密钥不需要拆分组**—— 直接扔进同一个凭据池，网关会自己轮转和避让。

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">快速开始</span>](/docs/quickstart)<a href="/docs/install" class="next"><span class="k">下一页 →</span><span class="t">部署</span></a>

</div>

</div>
