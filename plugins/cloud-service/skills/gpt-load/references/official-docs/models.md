<!-- Source: https://www.gpt-load.com/docs/models?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 配置</span>

</div>

# 模型管理

让客户端用自己习惯的模型名，并知道成本估算的价格是从哪来的。

<div class="docs-rule">

</div>

<div class="prose">

## 两个层面<a href="#two" class="anchor" aria-label="复制本节链接">§</a>

模型这件事分在两个地方，别搞混：

- **分组的模型标签页**——决定**这个分组对外开放哪些模型**。 只有列在这里的模型才能被请求到
- **模型页**——全局的模型价格和规格，影响成本估算

日常配置主要在分组里做，见 [分组与渠道](/docs/groups)。 这一页分别说明分组里的模型与别名，以及全局价格信息。

## 模型发现<a href="#discover" class="anchor" aria-label="复制本节链接">§</a>

不用手敲模型名——分组的模型标签页里可以**从上游拉取模型列表**， 勾选需要的即可。

发现结果取决于上游返回什么。有些服务商的列表包含大量你用不到的模型，**建议只勾选实际会用的**：范围小一点， 既避免应用误用贵模型，出问题时也更好排查。

上游没有列出但确实可用的模型，可以**手工添加**。

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fmdl-01-discover.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fmdl-01-discover.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="分组模型页打开获取上游模型列表抽屉，可搜索并勾选尚未添加的模型" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>拉取结果按上游返回，勾选后才对外开放。</p>
<figcaption><span class="label">FIG. 1 — 模型发现</span><span class="label">从上游拉取</span></figcaption>
</figure>

<div class="notice notice-blue">

<span class="t">快速同步</span>

模型发现抽屉里可以按上游结果**完全同步**、**仅添加**或**清理**当前列表。同步只比较上游发现结果，不把价格目录当作上游模型； 保留下来的模型会保留别名，确认后直接保存。

</div>

## 模型别名<a href="#alias" class="anchor" aria-label="复制本节链接">§</a>

别名在**分组的「模型与别名」标签页**中配置，解决一个很实际的问题：**客户端请求的名字， 和上游实际的模型名对不上**。

典型场景：

- **换供应商不改代码**——应用一直请求同一个名字， 你在网关这边把它指向不同的上游模型
- **统一命名**——不同服务商对同一个模型的命名各不相同， 用别名归一
- **版本收敛**——把带日期后缀的具体版本， 映射成一个稳定的名字

<figure class="fig">
<img src="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fmdl-02-alias.png&amp;w=3840&amp;q=75" style="color:transparent" loading="lazy" decoding="async" data-nimg="1" srcset="/_next/image?url=%2Fv2%2Fscreenshots%2Fzh%2Fmdl-02-alias.png&amp;w=3840&amp;q=75 1x" width="2880" height="1440" alt="分组的模型与别名表格，模型 ID 旁可直接编辑对外别名" /><span class="fig-hint" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld2JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjc1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1heGltaXplMiBsdWNpZGUtbWF4aW1pemUtMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0xNSAzaDZ2NiIgLz48cGF0aCBkPSJtMjEgMy03IDciIC8+PHBhdGggZD0ibTMgMjEgNy03IiAvPjxwYXRoIGQ9Ik05IDIxSDN2LTYiIC8+PC9zdmc+" class="lucide lucide-maximize2 lucide-maximize-2" />查看大图</span>
<p>应用请求别名，网关转发时换成实际的模型名。</p>
<figcaption><span class="label">FIG. 2 — 模型别名</span><span class="label">模型 ID → 对外别名</span></figcaption>
</figure>

## 价格从哪来<a href="#price" class="anchor" aria-label="复制本节链接">§</a>

成本估算需要模型价格。价格有两个来源：

- **自动同步**——从公开的模型价格数据源 （<a href="https://models.dev" target="_blank" rel="noopener noreferrer">models.dev</a>） 获取，覆盖常见模型
- **手动录入**——数据源没有的、或者你有专属价格的，自己填

自动同步可以在设置里关闭，见 [运行时设置](/docs/settings)。 关掉之后价格完全由你维护。

价格按 token 类型分别定义，这也是成本估算能算准的前提：

- **输入** / **输出**——最基本的两项
- **缓存读取**——通常远低于普通输入价
- **缓存写入**——部分服务商单独计费

部分模型还支持**按上下文长度分档计价**—— 超过某个长度后单价更高，这种阶梯价也能配。

## 手动改价<a href="#manual" class="anchor" aria-label="复制本节链接">§</a>

自动同步来的价格可以被**手动覆盖**。改过之后那条会标记为手动维护， 后续自动同步**不会覆盖掉你的修改**。

想恢复成自动同步的值，用重置即可。

<div class="notice notice-blue">

<span class="t">什么时候需要手动改</span>

你有企业协议价、走的是中转服务有自己的定价、 或者用了公开数据源没收录的模型——这几种情况下自动同步的价格不准， 手动填一次更靠谱。

</div>

分组设置和访问密钥编辑页都可设置价格倍率，默认均为 1。 最终费用 = 原计价费用 × 分组倍率 × 访问密钥倍率； 请求日志、用量统计和成本限额统一使用最终费用，倍率修改不回算历史。

## 没有价格会怎样<a href="#unpriced" class="anchor" aria-label="复制本节链接">§</a>

<div class="notice notice-blue">

<span class="t">不影响请求</span>

**没有价格数据不会导致请求失败。**模型照常可用， 只是这部分用量**不计入成本估算**—— 监控页的「成本未定价」指标会把它统计出来。

</div>

所以如果你发现成本估算明显偏低，先去 [监控与排障](/docs/monitor) 看数据完整度那一块： 「成本未定价」数字大，说明有模型缺价格，补上即可。

另外提醒一点：**价格变更不回算历史数据**。 今天补的价格只影响之后的统计，之前那些请求仍然是未计价状态。

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">订阅账号</span>](/docs/groups/subscription)<a href="/docs/access-keys" class="next"><span class="k">下一页 →</span><span class="t">访问密钥</span></a>

</div>

</div>
