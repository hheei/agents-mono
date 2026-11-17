<!-- Source: https://www.gpt-load.com/docs/quickstart?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 开始使用</span>

</div>

# 快速开始

从一台空机器到第一个请求返回结果，大约十分钟。不需要先理解任何概念，跟着做就行。

<div class="docs-rule">

</div>

<div class="prose">

## 开始之前<a href="#need" class="anchor" aria-label="复制本节链接">§</a>

准备两样东西：

- 装好 **Docker** 和 **Docker Compose** 的机器
- **一个上游服务的 API 密钥**——OpenAI、Anthropic、Gemini、DeepSeek 都行，有哪个用哪个

不需要准备数据库，默认用内置的 SQLite。也不需要单独部署前端， 管理台就在同一个程序里。

管理台默认使用 Modern 界面，管理员可在设置中切换 Classic；登录页和访问密钥只读会话使用 Modern。本文截图暂为旧界面，操作以当前按钮为准。

## 一 · 启动服务<a href="#run" class="anchor" aria-label="复制本节链接">§</a>

<div class="code-wrap">

<div class="code-cap">

<span class="label">拉起服务</span>

</div>

<div class="code-box">

git clone --depth 1 --branch main \\\
  https://github.com/tbphp/gpt-load.git\
cd gpt-load\
\
cp .env.example .env\
docker compose up -d

复制

</div>

</div>

确认服务起来了：

<div class="code-wrap">

<div class="code-box">

curl --fail http://127.0.0.1:3001/health

复制

</div>

</div>

返回正常就说明服务在跑。它默认**只监听本机**，外网访问不到—— 这是有意的，远程访问的正确做法见 [安全与上生产](/docs/security)。

## 二 · 登录管理台<a href="#login" class="anchor" aria-label="复制本节链接">§</a>

首次启动会自动生成一把管理密钥，读出来：

<div class="code-wrap">

<div class="code-box">

docker compose exec gpt-load \\\
  sh -c <span class="s">'cat /app/data/auth.key'</span>

复制

</div>

</div>

打开 <a href="http://127.0.0.1:3001" target="_blank" rel="noopener noreferrer">http://127.0.0.1:3001</a>，把这串密钥填进去。

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fqs-01-login.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fqs-01-login.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="GPT-Load 管理台登录页，包含管理密钥输入框和登录按钮" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<figcaption><span class="label">FIG. 1 — 登录</span><span class="label">填入管理密钥</span></figcaption>
</figure>

<div class="notice notice-blue">

<span class="t">也可以</span>

不想用自动生成的密钥，就在启动前于 `.env` 里设 **AUTH_KEY**。 另有一把 **ENCRYPTION_KEY** 用来加密你填进去的上游凭据， 它和数据库必须一起备份——丢了就解不开了。

</div>

## 三 · 建一个分组<a href="#group" class="anchor" aria-label="复制本节链接">§</a>

分组是「对接哪个上游、用哪些密钥」的集合。点**分组 → 新建分组**，第一步是选渠道：

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fqs-02-group-new.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fqs-02-group-new.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="导入渠道凭据的新建分组页，显示常用渠道按钮和其他渠道入口" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>常用渠道直接显示为按钮，其余渠道从「其他渠道」里选择。</p>
<figcaption><span class="label">FIG. 2 — 选择渠道</span><span class="label">渠道是建分组时选的</span></figcaption>
</figure>

选好渠道后，把 API 密钥粘进凭据框，再通过模型表格添加这个分组要开放的模型：

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fqs-03-group-filled.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fqs-03-group-filled.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="填写完成的新建分组表单，包含分组名称、示例 API 密钥和模型表格" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>一个分组可以放多把密钥，网关会在它们之间轮转；某把失效会自动避开，不影响其他。</p>
<figcaption><span class="label">FIG. 3 — 填好的分组</span><span class="label">渠道 · 凭据 · 模型</span></figcaption>
</figure>

保存之后这个分组就可用了。想了解每个选项的含义，见 [分组与渠道](/docs/groups)。

## 四 · 创建访问密钥<a href="#key" class="anchor" aria-label="复制本节链接">§</a>

分组管的是上游，访问密钥管的是「哪个应用能用什么」。 点**访问密钥 → 新建**，勾上刚建的分组，选好允许的协议，保存。

生成的这串密钥就是**交给应用的东西**——应用不需要知道背后有几个分组、 几把上游密钥。

## 五 · 发第一个请求<a href="#call" class="anchor" aria-label="复制本节链接">§</a>

把下面的密钥和模型名换成你自己的：

<div class="code-wrap">

<div class="code-cap">

<span class="label">cURL</span>

</div>

<div class="code-box">

<span class="k">export</span> GPT_LOAD_KEY=<span class="s">"你的访问密钥"</span>\
\
curl http://127.0.0.1:3001/v1/chat/completions \\\
  -H <span class="s">"Authorization: Bearer \${GPT_LOAD_KEY}"</span> \\\
  -H <span class="s">"Content-Type: application/json"</span> \\\
  -d <span class="s">'{"model": "你的模型名", "messages": \[{"role": "user", "content": "你好"}\]}'</span>

复制

</div>

</div>

拿到回复，整条链路就通了。换成已有的客户端也一样，通常只改两处：

<div class="code-wrap">

<div class="code-cap">

<span class="label">Python — OpenAI SDK</span>

</div>

<div class="code-box">

client = OpenAI(\
    base_url=<span class="s">"http://127.0.0.1:3001/v1"</span>,   <span class="c">\# 改这行</span>\
    api_key=<span class="s">"你的访问密钥"</span>,          <span class="c">\# 改这行</span>\
)

复制

</div>

</div>

管理台首页能**直接生成各客户端的接入参数**，不用自己拼：

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fqs-04-connect.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fqs-04-connect.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="管理台首页的一键接入区域，显示访问密钥、客户端选项和生成的配置参数" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>选好访问密钥和目标客户端，参数直接生成，复制即可。</p>
<figcaption><span class="label">FIG. 4 — 一键接入</span><span class="label">选密钥与客户端，自动生成参数</span></figcaption>
</figure>

## 接下来<a href="#next" class="anchor" aria-label="复制本节链接">§</a>

- 想搞清分组和访问密钥的关系 → [核心概念](/docs/concepts)
- 想接 Codex、Claude 这类订阅账号 → [订阅账号](/docs/groups/subscription)
- 想在自己的客户端里配好 → [客户端接入](/docs/clients)
- 准备正式用起来 → [安全与上生产](/docs/security)
- 从 1.4.x 过来 → [从 1.x 迁移](/docs/migrate-from-1x)， 注意**不能原地升级**

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">文档首页</span>](/docs)<a href="/docs/concepts" class="next"><span class="k">下一页 →</span><span class="t">核心概念</span></a>

</div>

</div>
