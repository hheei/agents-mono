<!-- Source: https://www.gpt-load.com/docs/reference/api?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 参考</span>

</div>

# 管理 API

管理台本身就是调用这套接口的。需要脚本化管理分组和密钥时可以直接用。

<div class="docs-rule">

</div>

<div class="prose">

## 认证<a href="#auth" class="anchor" aria-label="复制本节链接">§</a>

`/api` 下的受保护接口都使用 Bearer 认证：

<div class="code-wrap">

<div class="code-cap">

<span class="label">请求头</span>

</div>

<div class="code-box">

Authorization: Bearer <span class="s">你的 AUTH_KEY 或访问密钥</span>

复制

</div>

</div>

- **`AUTH_KEY`**——管理权限，可读写配置，也能执行 Reveal 等敏感操作
- **访问密钥**——只允许读取自身范围内的首页、模型、用量和脱敏请求日志， 不能修改配置，也不能查看上游凭据

需要写入或调用路由检查时必须使用 `AUTH_KEY`。

访问密钥当前只允许读取 `/api/auth/session`、`/api/home`、`/api/home/statistics`、`/api/models`、`/api/usage`、`/api/logs` 和 `/api/logs/{request_id}`；其他管理路由返回 403。

## 认证失败锁定<a href="#lockout" class="anchor" aria-label="复制本节链接">§</a>

<div class="notice notice-amber">

<span class="t">避免脚本反复重试错误密钥</span>

同一个直接对端地址在 30 分钟内连续 5 次管理认证失败，会被锁定 30 分钟。锁定期间返回 429 和 Retry-After；使用正确的 AUTH_KEY 成功认证会清除失败计数。

</div>

## 响应约定<a href="#shape" class="anchor" aria-label="复制本节链接">§</a>

统一的返回结构，成功与失败靠 `code` 区分：

<div class="code-wrap">

<div class="code-cap">

<span class="label">成功</span>

</div>

<div class="code-box">

{\
  <span class="s">"code"</span>: 0,\
  <span class="s">"message"</span>: <span class="s">"success"</span>,\
  <span class="s">"data"</span>: { ... }\
}

复制

</div>

</div>

<div class="code-wrap">

<div class="code-cap">

<span class="label">失败</span>

</div>

<div class="code-box">

{\
  <span class="s">"code"</span>: <span class="s">"错误标识"</span>,\
  <span class="s">"message"</span>: <span class="s">"人类可读的说明"</span>\
}

复制

</div>

</div>

**成功时 `code` 是数字 0**，失败时是字符串标识—— 判断时注意类型。

`data` 在成功和失败响应中都是可选字段；没有返回数据时会直接省略， 不要假设它始终存在或始终是对象。`message` 会随`Accept-Language` 本地化。

程序应判断 `code` 和结构化 `data`，不要解析本地化的`message`。完整错误码与恢复方式见 [错误与恢复参考](/docs/reference/errors#management)。

## 写入前提<a href="#write-contract" class="anchor" aria-label="复制本节链接">§</a>

<div class="tbl-wrap">

<table class="tbl">
<colgroup>
<col style="width: 33%" />
<col style="width: 33%" />
<col style="width: 33%" />
</colgroup>
<thead>
<tr>
<th style="width: 24%">请求头</th>
<th style="width: 42%">哪些接口要求</th>
<th>合同</th>
</tr>
</thead>
<tbody>
<tr>
<td class="m">Idempotency-Key</td>
<td><code>POST /api/groups</code><br />
<code>POST /api/groups/{group_id}/credentials/import</code><br />
<code>POST /api/groups/{group_id}/credentials/connect</code><br />
<code>POST /api/groups/{group_id}/credentials/{credential_id}/reset-credits/consume</code><br />
<code>POST /api/access-keys</code><br />
<code>POST /api/access-keys/{id}/rotate</code></td>
<td>必须且只能有一个值，格式为规范的小写 UUID v4；同一逻辑操作重试时复用原值</td>
</tr>
</tbody>
</table>

</div>

PUT /api/settings 直接保存所提交的设置项，不要求 If-Match；同一项以后一次成功保存的值为准。

<div class="notice notice-blue">

<span class="t">JSON 请求体使用严格合同</span>

声明 JSON 请求体的端点只接受单个对象；未知字段、重复字段、尾随的第二个 JSON 值都会被拒绝。 采用空对象合同的无参数操作只接受空请求体或 `{}`。

</div>

## 主要资源<a href="#res" class="anchor" aria-label="复制本节链接">§</a>

<div class="tbl-wrap">

| 路径                               | 用途                                   |
|------------------------------------|----------------------------------------|
| /api/auth/session                  | 确认当前 Bearer 身份类型               |
| /api/home                          | 首页摘要、统计与订阅账号概览           |
| /api/health                        | 运行态健康状态                         |
| /api/logs                          | 请求日志列表与详情                     |
| /api/usage                         | 用量与成本统计                         |
| /api/settings                      | 全局运行时设置                         |
| /api/system                        | 部署信息与版本更新检查                 |
| /api/route/inspect                 | 只读路由检查                           |
| /api/channels                      | 渠道描述符、字段与能力                 |
| /api/models                        | 项目模型列表与上游模型发现             |
| /api/model-prices                  | 模型价格查询、同步、修改、重置与删除   |
| /api/groups                        | 分组列表、创建、详情、设置、模型与删除 |
| /api/groups/{group_id}/credentials | 凭据管理，含批量导入、查看真实值、下载 |
| /api/credential-stages             | 订阅凭据的授权、导入、轮询与暂存状态   |
| /api/access-keys                   | 访问密钥，含限额与查看真实值           |

</div>

<div class="notice notice-blue">

<span class="t">自动化脚本要固定版本</span>

本表记录稳定资源边界，不复制仍在演进的全部端点字段。 当前版本的完整路由合同由代码中的 `internal/control/http_routes.go` 定义； 自动化脚本应固定 GPT-Load 的精确版本，并在升级后回归实际调用。

</div>

## 几个例子<a href="#example" class="anchor" aria-label="复制本节链接">§</a>

<div class="code-wrap">

<div class="code-cap">

<span class="label">列出所有分组</span>

</div>

<div class="code-box">

curl http://127.0.0.1:3001/api/groups \\\
  -H <span class="s">"Authorization: Bearer \$AUTH_KEY"</span>

复制

</div>

</div>

<div class="code-wrap">

<div class="code-cap">

<span class="label">查看健康状态</span>

</div>

<div class="code-box">

curl http://127.0.0.1:3001/api/health \\\
  -H <span class="s">"Authorization: Bearer \$AUTH_KEY"</span>

复制

</div>

</div>

<div class="code-wrap">

<div class="code-cap">

<span class="label">路由检查：这个请求会走哪</span>

</div>

<div class="code-box">

curl -X POST http://127.0.0.1:3001/api/route/inspect \\\
  -H <span class="s">"Authorization: Bearer \$AUTH_KEY"</span> \\\
  -H <span class="s">"Content-Type: application/json"</span> \\\
  -d <span class="s">'{"protocol":"openai-completions","external_model":"gpt-4o","access_key_id":1}'</span>

复制

</div>

</div>

`access_key_id` 是管理台中访问密钥的数字 ID。 路由检查只计算当前配置下的候选结果，不会向上游发送真实请求。

<div class="code-wrap">

<div class="code-cap">

<span class="label">导入凭据：带幂等键</span>

</div>

<div class="code-box">

curl -X POST http://127.0.0.1:3001/api/groups/1/credentials/import \\\
  -H <span class="s">"Authorization: Bearer \$AUTH_KEY"</span> \\\
  -H <span class="s">"Idempotency-Key: 7f6a7f86-3f58-4ae3-a1a1-46d3b8d17b71"</span> \\\
  -H <span class="s">"Content-Type: application/json"</span> \\\
  -d <span class="s">'{"credentials":"sk-example"}'</span>

复制

</div>

</div>

## 注意事项<a href="#warn" class="anchor" aria-label="复制本节链接">§</a>

<div class="notice notice-amber">

<span class="t">不要暴露到公网</span>

管理接口能读取**所有渠道凭据的真实值**（`/reveal` 一类的端点就是干这个的）。`AUTH_KEY` 泄漏等于全部上游密钥泄漏。\
必须限制来源，配置方式见 [安全与上生产](/docs/security)。

</div>

- **脚本里别硬编码 AUTH_KEY**——用环境变量或密钥管理工具
- **接口会随版本调整**——自动化脚本升级后要回归验证
- **不要自行改变幂等键**——结果不明时复用原值；新的逻辑操作再生成新值

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">环境变量</span>](/docs/reference/env)<a href="/docs/reference/errors" class="next"><span class="k">下一页 →</span><span class="t">错误与恢复参考</span></a>

</div>

</div>
