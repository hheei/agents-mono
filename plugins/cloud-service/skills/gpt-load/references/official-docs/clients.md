<!-- Source: https://www.gpt-load.com/docs/clients?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 配置</span>

</div>

# 客户端接入

绝大多数客户端只要改两处：把地址指向 GPT-Load，把密钥换成访问密钥。

<div class="docs-rule">

</div>

<div class="prose">

## 通用规则<a href="#rule" class="anchor" aria-label="复制本节链接">§</a>

不管什么客户端，要改的都是这两样：

- **接口地址**——改成 `http://127.0.0.1:3001`（加不加 `/v1` 取决于客户端的习惯，见下面各例）
- **密钥**——换成管理台里创建的**访问密钥**， 不是上游服务商的密钥

认证方式**按客户端原本的习惯来**，网关都认：`Authorization: Bearer`、`x-api-key`、`x-goog-api-key`，以及 Gemini 的 `key` 查询参数。

<div class="notice notice-blue">

<span class="t">模型名要对得上</span>

请求里的模型名，必须在这把访问密钥能用的某个分组里**已经开放**。 提示模型不存在时，先去分组的模型标签页确认，见 [分组与渠道](/docs/groups)。

</div>

## 让管理台生成配置<a href="#auto" class="anchor" aria-label="复制本节链接">§</a>

不用自己拼——管理台首页可以**直接生成各客户端的接入参数**： 选一把访问密钥，选目标客户端，配置片段就出来了，复制即可。

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fcli-01-connect.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fcli-01-connect.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="管理台首页的一键生成配置区域，显示访问密钥、客户端列表和配置片段" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>支持 Claude Code、Codex、Gemini CLI、Cherry Studio、Cline、NextChat、Open WebUI、CC Switch、New API 与 curl。 生成的配置里会标出这个客户端需要哪个协议，照着勾就不会错。</p>
<figcaption><span class="label">FIG. 1 — 一键生成配置</span><span class="label">选密钥与客户端</span></figcaption>
</figure>

## OpenAI SDK<a href="#sdk" class="anchor" aria-label="复制本节链接">§</a>

官方 SDK 只改两行：

<div class="code-wrap">

<div class="code-cap">

<span class="label">Python</span>

</div>

<div class="code-box">

<span class="k">from</span> openai <span class="k">import</span> OpenAI\
\
client = OpenAI(\
    base_url=<span class="s">"http://127.0.0.1:3001/v1"</span>,   <span class="c">\# 改这行</span>\
    api_key=<span class="s">"你的访问密钥"</span>,          <span class="c">\# 改这行</span>\
)\
\
resp = client.chat.completions.create(\
    model=<span class="s">"你的模型名"</span>,\
    messages=\[{<span class="s">"role"</span>: <span class="s">"user"</span>, <span class="s">"content"</span>: <span class="s">"你好"</span>}\],\
)

复制

</div>

</div>

<div class="code-wrap">

<div class="code-cap">

<span class="label">Node.js</span>

</div>

<div class="code-box">

<span class="k">import</span> OpenAI <span class="k">from</span> <span class="s">"openai"</span>;\
\
<span class="k">const</span> client = <span class="k">new</span> OpenAI({\
  baseURL: <span class="s">"http://127.0.0.1:3001/v1"</span>,\
  apiKey: <span class="s">"你的访问密钥"</span>,\
});

复制

</div>

</div>

环境变量方式同样可行：设置 `OPENAI_BASE_URL` 与 `OPENAI_API_KEY`，代码就完全不用动。

## Anthropic SDK<a href="#anthropic" class="anchor" aria-label="复制本节链接">§</a>

<div class="code-wrap">

<div class="code-cap">

<span class="label">Python</span>

</div>

<div class="code-box">

<span class="k">from</span> anthropic <span class="k">import</span> Anthropic\
\
client = Anthropic(\
    base_url=<span class="s">"http://127.0.0.1:3001"</span>,   <span class="c">\# 注意：不带 /v1</span>\
    api_key=<span class="s">"你的访问密钥"</span>,\
)

复制

</div>

</div>

Anthropic 客户端走 `/v1/messages`，SDK 会自己拼上这段路径， 所以 `base_url` 填到根即可。

## Claude Code<a href="#claude-code" class="anchor" aria-label="复制本节链接">§</a>

用环境变量指向网关：

<div class="code-wrap">

<div class="code-cap">

<span class="label">终端里设置后再启动</span>

</div>

<div class="code-box">

<span class="k">export</span> ANTHROPIC_BASE_URL=<span class="s">"http://127.0.0.1:3001"</span>\
<span class="k">export</span> ANTHROPIC_AUTH_TOKEN=<span class="s">"你的访问密钥"</span>\
<span class="k">export</span> ANTHROPIC_MODEL=<span class="s">"YOUR_MODEL"</span>\
<span class="k">export</span> ANTHROPIC_CUSTOM_MODEL_OPTION=<span class="s">"\$ANTHROPIC_MODEL"</span>\
<span class="k">export</span> CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=<span class="s">"1"</span>\
\
claude

复制

</div>

</div>

将 YOUR_MODEL 替换为这把访问密钥可用的模型 ID，并在同一 Shell 中启动或重启 Claude Code。 该模型会用于启动，也会加入 /model 的自定义选项； 自动发现仅额外列出 ID 含 claude 或 anthropic 的模型（不区分大小写）。

要长期生效就写进 shell 配置文件。这把访问密钥需要勾选 **Anthropic Messages** 协议。

## Codex CLI<a href="#codex" class="anchor" aria-label="复制本节链接">§</a>

Codex 走 OpenAI 协议，把它的接口地址和密钥指向网关即可。 管理台的一键生成里有 Codex 选项，直接复制那段配置最稳妥。

<div class="code-wrap">

<div class="code-cap">

<span class="label">环境变量方式</span>

</div>

<div class="code-box">

<span class="k">export</span> OPENAI_BASE_URL=<span class="s">"http://127.0.0.1:3001/v1"</span>\
<span class="k">export</span> OPENAI_API_KEY=<span class="s">"你的访问密钥"</span>

复制

</div>

</div>

<div class="notice notice-amber">

<span class="t">Codex 要的是 Responses，不是 Chat Completions</span>

这把访问密钥必须勾选 **OpenAI Responses** 协议。 Codex 用的是 Responses 接口，只勾了 Chat Completions 会被直接拒绝—— 路由检查里会看到 `protocol_filtered`。

</div>

<div class="notice notice-blue">

<span class="t">别和订阅账号搞混</span>

这里说的是**把 Codex 客户端接到网关**。 如果你想接的是「Codex 订阅账号作为上游」，那是另一件事，见 [订阅账号](/docs/groups/subscription)。

</div>

## Gemini CLI<a href="#gemini-cli" class="anchor" aria-label="复制本节链接">§</a>

<div class="code-wrap">

<div class="code-cap">

<span class="label">环境变量方式</span>

</div>

<div class="code-box">

<span class="k">export</span> GOOGLE_GEMINI_BASE_URL=<span class="s">"http://127.0.0.1:3001"</span>\
<span class="k">export</span> GEMINI_API_KEY=<span class="s">"你的访问密钥"</span>

复制

</div>

</div>

Gemini 客户端走 `/v1beta/models/…`， 访问密钥需要勾选 **Gemini** 协议。

## 桌面客户端<a href="#gui" class="anchor" aria-label="复制本节链接">§</a>

Cherry Studio、NextChat、Open WebUI、Cline 这类图形客户端， 通常在设置里有「自定义 API 地址」和「API Key」两个输入框，填法一致：

- **API 地址**：`http://127.0.0.1:3001/v1`
- **API Key**：你的访问密钥
- **模型**：填分组里开放的模型名； 有些客户端支持点「获取模型列表」自动拉取

具体到某个客户端的截图步骤，用管理台的一键生成更快—— 它会给出那个客户端对应的准确字段。

## 接不上时<a href="#trouble" class="anchor" aria-label="复制本节链接">§</a>

按这个顺序排查，多数问题在前两步就能定位：

1.  **先用 curl 验证网关本身**——排除客户端配置问题：

<div class="code-wrap">

<div class="code-cap">

<span class="label">最小验证</span>

</div>

<div class="code-box">

curl http://127.0.0.1:3001/v1/chat/completions \\\
  -H <span class="s">"Authorization: Bearer 你的访问密钥"</span> \\\
  -H <span class="s">"Content-Type: application/json"</span> \\\
  -d <span class="s">'{"model":"你的模型名","messages":\[{"role":"user","content":"hi"}\]}'</span>

复制

</div>

</div>

2.  **curl 通了但客户端不通**——多半是地址末尾的 `/v1` 多了或少了，或者协议没在访问密钥里勾选
3.  **提示模型不存在**——去分组的模型标签页确认该模型已开放
4.  **请求发出去但失败**——用 [监控与排障](/docs/monitor) 里的请求日志看具体原因， 路由检查能展示候选分组和当前可用凭据数量

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">访问密钥</span>](/docs/access-keys)<a href="/docs/monitor" class="next"><span class="k">下一页 →</span><span class="t">监控与排障</span></a>

</div>

</div>
