<!-- Source: https://www.gpt-load.com/docs/faq?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 参考</span>

</div>

# 常见问题

按现象归类。找不到答案时，先用监控页的路由检查——多数问题它能直接给出原因。

<div class="docs-rule">

</div>

<div class="prose">

## 装不起来<a href="#start" class="anchor" aria-label="复制本节链接">§</a>

### 端口被占用

默认端口 3001。改 `.env` 里的 `PORT` 即可。 注意订阅账号还会用到 1455、54545、51121 三个回调端口， 它们**由上游固定、不能改**。

一台主机上同一时刻只能有一个默认 Compose 实例使用本地回调授权。已有 OAuth JSON 的账号可以导入，Grok 可以使用设备码。

### 改了 HOST 但容器里不生效

容器内的 `HOST` 和 `DATA_DIR` 是被固定的。

Compose 主服务的发布地址优先使用 BIND_ADDRESS；未设置时才回退到 HOST。它们都不改变容器内的监听地址。

### 启动报权限错误

受管数据目录会被收紧到仅属主可访问。 如果目录归属或链接类型无法确认，程序会**拒绝启动**而不是降级—— 这是有意的，避免把凭据写到权限不明的位置。检查 `DATA_DIR` 的属主。

## 连不上<a href="#connect" class="anchor" aria-label="复制本节链接">§</a>

### 客户端报连接失败

先用 curl 排除客户端配置问题：

<div class="code-wrap">

<div class="code-cap">

<span class="label">最小验证</span>

</div>

<div class="code-box">

curl --fail http://127.0.0.1:3001/health

复制

</div>

</div>

这个通了说明服务正常，问题在客户端配置—— 最常见的是地址末尾 `/v1` 多了或少了，见 [客户端接入](/docs/clients)。

### 提示未授权 / 401

确认用的是**访问密钥**而不是 `AUTH_KEY`， 也不是上游服务商的密钥。三者用途完全不同。

### 远程访问不了

服务**默认只监听 127.0.0.1**，这是有意的安全默认值。 正确做法是 SSH 端口转发或反向代理，**不要直接改成 0.0.0.0 暴露公网**—— 管理台泄漏等于所有上游凭据泄漏。见 [安全与上生产](/docs/security)。

## 模型相关<a href="#model" class="anchor" aria-label="复制本节链接">§</a>

### 提示模型不存在

用路由检查最快，它会直接指出问题在访问密钥、分组还是凭据。 对照 [路由检查原因码](/docs/reference/errors#route-reasons)修改配置后，再执行一次检查确认当前状态。

### 想让客户端用别的模型名

用**模型别名**：客户端请求 A，网关转发时换成上游的 B。 换供应商时应用不用改代码，见 [模型管理](/docs/models)。

## 请求失败<a href="#fail" class="anchor" aria-label="复制本节链接">§</a>

### 偶尔失败，重试就好

多半是上游限流。模型级限制只冷却该凭据的对应模型，其他模型仍可使用；网关会在安全边界内切换候选——**加更多凭据是最直接的缓解**。 频繁发生的话看健康页，确认是不是可用凭据太少。

### 凭据被拉黑了

连续失败超过阈值会自动拉黑。API Key 分组会按验证间隔自动探测，探测成功后恢复；订阅凭据不走这条自动恢复路径，需要重新授权或人工处理。阈值可在运行时设置调整。

### 推理模型总是超时

这类模型在开始输出前可能思考很久， 需要调大**首字节超时**——注意不是请求超时。 三种超时分别管什么，见 [运行时设置](/docs/settings)。

### 流式输出中途断开

调大**流空闲超时**。如果前面挂了反向代理， 还要确认代理没有缓冲流式响应——Nginx 需要 `proxy_buffering off`。

## 订阅账号<a href="#sub" class="anchor" aria-label="复制本节链接">§</a>

### 远程部署完不成 OAuth 授权

因为浏览器里的 `localhost` 指向你自己的电脑，不是服务器。 两种解法：**把跳转失败后地址栏里的完整回调 URL 粘回管理台**， 或者用 SSH 端口转发。详见 [订阅账号](/docs/groups/subscription)。

### 账号显示需要重新授权

可从账号卡片的更多菜单尝试「刷新凭据」，仍失败时重新连接或导入账号。 「结果未知」也可这样处理；「刷新额度」不会恢复授权。四种授权状态的含义见订阅账号页。

### 额度还有很多，为什么切换了账号

**额度信息只作展示，不参与调度决策。**真正触发切换的是上游返回的限流响应—— 被限流就立即冷却换人，不管显示的额度是多少。

## 用量与成本<a href="#cost" class="anchor" aria-label="复制本节链接">§</a>

### 成本和服务商账单对不上

**这是预期的。**成本是根据上游返回的 token 用量 结合模型价格、分组与访问密钥的价格倍率估算出来的，用于运营分析，**不等于账单**。已知偏差来源： 上游没返回用量的请求不计入、没有价格数据的模型不计价、 价格变更不回算历史。

### 成本估算明显偏低

看监控页的数据完整度那一块。**「成本未定价」数字大**说明有模型缺价格，补上即可；**「用量缺失」数字大**时，检查上游是否返回用量数据，见 [监控与排障](/docs/monitor)。

## 运维<a href="#ops" class="anchor" aria-label="复制本节链接">§</a>

### 能不能多实例部署

<div class="notice notice-amber">

<span class="t">不能</span>

2.0 是**单实例设计**，实例之间不共享状态。 在多个实例前面挂负载均衡会导致调度、冷却、限流各算各的。 需要更大规模时，**按业务维度拆成多个独立部署**。

</div>

### 能从 1.x 升级上来吗

**不能原地升级，也没有数据导入工具。**2.0 是完全重写的版本。正确做法是并行部署、验证后切流量，见 [从 1.x 迁移](/docs/migrate-from-1x)。

### 备份要备哪些

**数据库和 `encryption.key` 必须一起备。**只备数据库的话，恢复出来的凭据是解不开的密文， 而且本版本不支持更换主密钥。见 [数据库与备份](/docs/database)。

### 日志占用磁盘太多

调小请求日志的保留天数（默认 7 天）。 请求量大时这个值对磁盘影响明显，尤其是用 SQLite 的部署。

<div class="notice notice-blue">

<span class="t">没找到答案</span>

先用 [监控与排障](/docs/monitor) 里的**路由检查**和**请求日志**定位——多数问题能直接看出原因。 仍无法解决的话，欢迎到 <a href="https://github.com/tbphp/gpt-load/issues" target="_blank" rel="noopener noreferrer">GitHub Issues</a> 提问，附上请求日志里的错误信息会快很多。**安全问题请按 SECURITY.md 的流程私下反馈。**

</div>

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">错误与恢复参考</span>](/docs/reference/errors)<a href="/docs/migrate-from-1x" class="next"><span class="k">下一页 →</span><span class="t">从 1.x 迁移</span></a>

</div>

</div>
