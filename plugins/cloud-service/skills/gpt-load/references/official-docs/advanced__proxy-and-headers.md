<!-- Source: https://www.gpt-load.com/docs/advanced/proxy-and-headers?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 深入</span>

</div>

# 代理与请求头

这一页是给非标场景准备的：网络受限、不同凭据需要不同出口，或上游要求特殊请求头。用不到就不用看。

<div class="docs-rule">

</div>

<div class="prose">

## 什么时候需要<a href="#when" class="anchor" aria-label="复制本节链接">§</a>

常见的几种情况：

- **服务器访问不了某些上游**——需要走代理出去
- **不同凭据要走不同出口**——比如按区域分流
- **上游要求特定请求头**——某些中转服务会校验来源标识
- 浏览器需要跨域调用，或客户端需要自定义响应头

没有这些需求的话，这一页的配置全都留空即可。

## 出站代理<a href="#proxy" class="anchor" aria-label="复制本节链接">§</a>

代理配置有三种模式：

- **继承**——用上一级的配置，这是默认值
- **直连**——**明确不走代理**， 即使上一级配了也不用
- **自定义**——指定具体的代理地址

<div class="notice notice-blue">

<span class="t">直连不等于继承</span>

这两个容易混。**继承**是「跟着上级走」，上级配了代理就走代理；**直连**是「明确不走」，用来给个别凭据开例外—— 比如大部分上游要代理，但有一个在内网、走代理反而不通。

</div>

<div class="notice notice-amber">

<span class="t">三个云平台渠道例外</span>

Azure OpenAI、AWS Bedrock 与 Google Vertex AI 当前不支持 GPT-Load 托管代理。其他渠道的准确状态以支持矩阵为准。

</div>

[查看托管代理支持矩阵 →](/docs/reference/support-matrix)

## 四级覆盖<a href="#level" class="anchor" aria-label="复制本节链接">§</a>

代理可以配在四个层级，**越具体的优先**。 完整的优先级链是：凭据 → 分组 → 全局 → 环境变量 → 直连。

1.  **环境变量**——`HTTP_PROXY` 与 `HTTPS_PROXY`，进程级的兜底出口。 只在上面三级都没有明确指定时才生效，改完需要重启进程
2.  **全局**——管理台里配置的默认出口
3.  **分组**——覆盖全局，这个分组的所有凭据都走它
4.  **单个凭据**——覆盖分组，只对这一个凭据生效

<div class="notice notice-blue">

<span class="t">环境变量是最后一层，不是第一层</span>

管理台里选**继承**时，才会继续往下找；一路都是继承，最后才落到`HTTP_PROXY` 这类环境变量上。所以在管理台配了全局代理之后， 环境变量就不再起作用了。反过来，任何一级选了**直连**， 环境变量同样不生效。\
这三个变量在 [环境变量](/docs/reference/env) 页有完整说明。

</div>

凭据级这一层是很多网关没有的。实际用途： 同一个服务商的多个账号分属不同区域， 需要各自从对应区域的出口访问，否则会被判定为异地登录。

## 上游请求头规则<a href="#headers" class="anchor" aria-label="复制本节链接">§</a>

可以在转发前修改发往上游的请求头，支持**添加**和**删除**两类动作。配置分全局与分组两级。

典型用途：

- **补上游要求的标识头**——某些中转服务需要特定的来源标记
- **去掉客户端带来的干扰头**—— 有些客户端会附带自己的追踪头，上游可能不接受

<div class="notice notice-amber">

<span class="t">别动认证头</span>

认证相关的头由网关自己管理——它需要按选中的凭据动态填充。 用规则去改它会导致请求失败。

</div>

## 响应头与跨域<a href="#browser-access" class="anchor" aria-label="复制本节链接">§</a>

在「设置 → 浏览器访问」配置下游响应头规则，可设置或移除返回客户端的自定义 Header。 认证、协议必要字段和网关保留头不能覆盖，CORS 头通过专用配置管理。

CORS 默认关闭。浏览器跨域调用时，启用后配置允许的来源、方法和请求头；携带凭据时不能将允许来源设为 \*。

这两项仅作用于 /v1、/v1beta 数据面，不影响 /api 管理接口。 允许的预检会自动处理，实际请求仍需 AccessKey 认证。

配置位置见 [运行时设置](/docs/settings)。

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">协议与转换边界</span>](/docs/internals/protocols)<a href="/docs/reference/support-matrix" class="next"><span class="k">下一页 →</span><span class="t">渠道与能力矩阵</span></a>

</div>

</div>
