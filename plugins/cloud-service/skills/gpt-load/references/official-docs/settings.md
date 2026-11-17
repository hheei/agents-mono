<!-- Source: https://www.gpt-load.com/docs/settings?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 运维</span>

</div>

# 运行时设置

这些参数在管理台保存后即时生效，不需要重启。和环境变量是两回事——那些改完要重启。

<div class="docs-rule">

</div>

<div class="prose">

## 两层设置<a href="#two" class="anchor" aria-label="复制本节链接">§</a>

超时、拉黑阈值等运行参数支持两层设置：

- **系统级**——在设置页配置，作为全局默认值
- **分组级**——在分组的设置标签页配置，**启用覆盖后编辑，恢复默认则继承系统值；保存后生效**

这样设计是因为不同上游的特性差异很大： 有的服务商响应慢但稳定，有的快但偶尔抽风， 用同一套超时和拉黑阈值不合适。

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fset-01-runtime.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fset-01-runtime.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="系统运行时设置页，展示路由策略及全局设置分区" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>支持分组覆盖的参数，未覆盖时继承系统值。</p>
<figcaption><span class="label">FIG. 1 — 系统级设置</span><span class="label">全局默认值</span></figcaption>
</figure>

<div class="notice notice-blue">

<span class="t">怎么确认生效值</span>

分组的设置标签页会标出哪些是**继承自系统**、哪些是**本分组单独覆盖**的。 排查「为什么这个分组行为和别的不一样」时，先看这里。

</div>

## 三种超时<a href="#timeout" class="anchor" aria-label="复制本节链接">§</a>

三个超时管的是请求生命周期里的不同阶段，症状不同，别调错：

<div class="tbl-wrap">

| 参数 | 管什么 | 该调它的症状 |
|----|----|----|
| 首字节超时 | 从发出请求到收到第一个字节 | 上游排队久，请求还没开始响应就被判失败 |
| 单次上游请求超时 | 每次上游尝试的时长上限，不是跨重试的总时长 | 长输出任务被中途掐断 |
| 流空闲超时 | 流式响应中，两个数据块之间的最大间隔 | 流式输出中途卡住很久，但连接没断 |

</div>

**推理模型要特别注意首字节超时**—— 它们在开始输出前可能思考很久，默认值偏紧的话会误判为失败。

## 重试与拉黑<a href="#retry" class="anchor" aria-label="复制本节链接">§</a>

- **重试次数**——全局额外重试预算，不支持分组覆盖。 调大能提高成功率，但失败请求的耗时也会变长
- **拉黑阈值**——一个凭据连续失败多少次后被自动摘除。 调小能更快隔离坏凭据，但偶发抖动也可能误伤

两者的完整机制见 [调度是怎么做的](/docs/internals/scheduling)。

## 路由策略<a href="#routing" class="anchor" aria-label="复制本节链接">§</a>

在「设置 → 路由调度」选择全局路由策略：默认「原生优先」，优先使用原生路由；「混合权重」让原生与转换候选按有效权重竞争。 该项不支持分组覆盖，实际流量仍受可用凭据、请求亲和与协议能力限制。

Responses WebSocket 默认开启，分组可继承或覆盖；关闭会中断受影响连接，普通 HTTP/SSE 不受影响。全局关闭不会覆盖分组的显式开启。

## 会话亲和<a href="#affinity" class="anchor" aria-label="复制本节链接">§</a>

开启后，网关会根据访问密钥、客户端协议以及请求中的指令或首个用户输入前缀 生成软亲和键，具有相同稳定前缀的请求会尽量落在同一个凭据上。 三个参数：

- **开关**——是否启用
- **TTL**——一条亲和记录保留多久
- **容量**——最多记住多少条会话（默认一万条）

<div class="notice notice-blue">

<span class="t">它是软亲和，不是资源绑定</span>

软亲和只尽量复用凭据，不保证资源归属。Responses 的 previous_response_id 使用独立的续接绑定，不受亲和开关影响；conversation 和其他资源引用不在该保证内。

</div>

## 日志留存<a href="#logs" class="anchor" aria-label="复制本节链接">§</a>

**请求日志保留天数**决定日志留多久，默认 7 天，过期自动清理。

调大能查更久的历史，但数据库会持续增长—— 请求量大的话注意磁盘。用 SQLite 时尤其要留意。

## 其他<a href="#misc" class="anchor" aria-label="复制本节链接">§</a>

- **校验间隔**——多久对凭据做一次可用性校验
- **模型价格自动同步**——是否从公开数据源同步价格， 见 [模型管理](/docs/models)。 注意这一项可以被环境变量 `MODELS_DEV_AUTO_SYNC_ENABLED` 接管—— 一旦设了那个变量，这里就变成只读，见 [环境变量](/docs/reference/env)
- **上游请求头、下游响应头与跨域**—— 非标场景用，见 [代理与请求头](/docs/advanced/proxy-and-headers)

## 什么时候该调<a href="#when" class="anchor" aria-label="复制本节链接">§</a>

**默认值适用于大多数情况，没有明确症状就别动。**盲目调大超时和重试，只会让失败的请求失败得更慢。

按症状对号入座：

- **推理模型频繁超时** → 调大首字节超时（优先在该分组单独调）
- **长文本任务被截断** → 调大请求超时
- **流式输出中途断开** → 调大流空闲超时
- **好凭据被频繁拉黑** → 调大拉黑阈值
- **坏凭据隔离太慢** → 调小拉黑阈值
- **有状态请求报找不到上下文** → 检查响应 ID 是否已登记、原凭据是否可用；其他资源引用需单凭据或上游支持共享

调整前先用 [监控与排障](/docs/monitor) 确认症状，**只改和症状相关的那一项**，改完观察一段时间再动下一个。

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">监控与排障</span>](/docs/monitor)<a href="/docs/database" class="next"><span class="k">下一页 →</span><span class="t">数据库与备份</span></a>

</div>

</div>
