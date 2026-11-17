<!-- Source: https://www.gpt-load.com/docs/monitor?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 运维</span>

</div>

# 监控与排障

请求失败时，这一页帮你定位到是哪个凭据、哪一步出的问题。

<div class="docs-rule">

</div>

<div class="prose">

## 四个监控入口<a href="#where" class="anchor" aria-label="复制本节链接">§</a>

Modern 管理台的监控导航分四块，各管一件事：

- **健康**——现在哪些凭据可用、哪些出了问题
- **用量与成本**——花了多少 token、多少钱
- **请求日志**——每一条请求的详细记录
- **路由检查**——给定条件，看网关会怎么选

## 健康<a href="#health" class="anchor" aria-label="复制本节链接">§</a>

健康页给出**当前每个分组、每个凭据的可用状态**， 以及需要注意的问题清单。

凭据的状态含义：

- **可用**——正常参与轮转
- **冷却中**——刚被上游限流或报错，暂时跳过，到点自动恢复
- **已拉黑**——连续失败超过阈值，自动摘除。API Key 分组会按验证间隔自动探测并恢复；订阅凭据不走这条自动恢复路径
- **已停用**——你手动关掉的，不参与轮转

冷却和拉黑的触发条件、恢复方式见 [调度是怎么做的](/docs/internals/scheduling)。

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fmon-01-health.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fmon-01-health.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="监控健康页，展示凭据健康概览、分组状态和问题列表" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>有问题的凭据会集中列出，不用逐个分组翻。</p>
<figcaption><span class="label">FIG. 1 — 健康</span><span class="label">分组 · 凭据 · 问题清单</span></figcaption>
</figure>

## 请求日志<a href="#logs" class="anchor" aria-label="复制本节链接">§</a>

每条请求都有记录，可以按时间、分组、模型、状态等条件筛选。**点开单条能看到完整链路**：用了哪个凭据、 是否发生过协议转换、重试了几次、上游返回了什么。

排障时最有用的几个字段：

- **路由身份**——这条请求实际走了哪个分组、哪个凭据
- **协议转换**——客户端用的协议与上游协议不同时， 这里能看到转换过程
- **错误信息**——经过脱敏和长度限制的错误摘要， 配合错误码、来源、范围和命中规则判断

字段和错误码见 [错误与恢复参考](/docs/reference/errors#request-logs)； 日志保留天数见 [运行时设置](/docs/settings)。

## 路由检查<a href="#inspect" class="anchor" aria-label="复制本节链接">§</a>

**这是排障最快的入口。**输入一把访问密钥和一个模型名， 它直接告诉你：这个请求是否可以路由、有哪些候选分组、当前有多少可用凭据， 或者为什么走不通。

典型用途：

- **「为什么提示模型不存在」**——检查器会告诉你 这把密钥能用的分组里，有没有开放这个模型
- **「为什么没有可用凭据」**——按候选分组查看凭据总数和当前可用数
- **「加了新分组但没生效」**——确认访问密钥有没有授权到它

[查看路由检查原因码及处理方式 →](/docs/reference/errors#route-reasons)

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fmon-02-inspect.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fmon-02-inspect.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="路由检查页，展示模拟请求条件、可路由结论、候选分组和可用凭据数量" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>不用发真实请求就能看到候选分组与当前可用凭据。</p>
<figcaption><span class="label">FIG. 2 — 路由检查</span><span class="label">条件 · 候选分组 · 凭据数量</span></figcaption>
</figure>

## 用量与成本<a href="#usage" class="anchor" aria-label="复制本节链接">§</a>

展示请求量、成败趋势、缓存命中率、token 分类明细和成本估算， 可以按分组、模型、访问密钥等维度看分布。

token 分类需要理解一下，它直接影响成本：

- **非缓存输入**——正常计费的输入 token
- **缓存读取**——命中缓存的部分，**通常远比非缓存便宜**
- **缓存写入**——建立缓存的开销，部分服务商单独计费
- **输出**——模型生成的 token，通常最贵

所以**缓存命中率高是好事**——同样的请求量， 缓存命中率上去了，成本会明显下降。

<div class="notice notice-amber">

<span class="t">成本是估算，不是账单</span>

成本由**上游 token 用量、模型价格及分组与访问密钥价格倍率**推算而来， 用于运营分析和容量规划，**不等于服务商账单，也不能作为财务对账依据**。 几个已知偏差来源：上游未返回用量的请求无法计入； 没有价格数据的模型不计价；价格变更不回算历史数据。

</div>

## 数据完整度<a href="#quality" class="anchor" aria-label="复制本节链接">§</a>

用量页有一块「质量」指标，它衡量的**不是服务质量， 而是统计数据本身有多完整**：

<div class="tbl-wrap">

| 指标         | 含义                         | 影响                     |
|--------------|------------------------------|--------------------------|
| 用量缺失     | 上游没有返回 token 用量      | 这些请求不计入统计与成本 |
| 用量部分缺失 | 只返回了部分维度             | 成本偏低于实际           |
| 成本未定价   | 有用量，但该模型没有价格数据 | 不计入成本，用量仍然统计 |
| 部分定价     | 只有部分 token 类型有价格    | 成本偏低                 |

</div>

这些数字大的时候，说明**成本估算的可信度在下降**。 「未定价」通常是模型价格没同步到，见 [模型管理](/docs/models)。

## 排障顺序<a href="#flow" class="anchor" aria-label="复制本节链接">§</a>

遇到问题时按这个顺序走，通常两三步就能定位：

1.  **先看健康**——凭据是不是都冷却或拉黑了？ 是的话问题在上游或密钥本身
2.  **再用路由检查**——有没有候选分组和可用凭据？ 走不通的话它会直接告诉你原因
3.  **最后翻请求日志**——找到那条失败的， 看错误码和已脱敏的错误摘要

怀疑是某一把凭据本身失效时，还有一个更直接的办法： 去分组的凭据页对它**测试连接**， 用一次真实请求当场确认，见 [分组与渠道](/docs/groups)。

如果健康正常、路由检查也显示存在候选分组和可用凭据，但请求还是失败， 那多半是上游侧的问题（额度、模型下线、区域限制）， 日志里的错误码和安全摘要会提供进一步线索。

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">客户端接入</span>](/docs/clients)<a href="/docs/settings" class="next"><span class="k">下一页 →</span><span class="t">运行时设置</span></a>

</div>

</div>
