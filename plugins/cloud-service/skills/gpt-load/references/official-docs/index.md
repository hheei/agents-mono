<!-- Source: https://www.gpt-load.com/docs?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main-wide">

<div class="docs-crumb">

<span class="label">文档</span>

</div>

# GPT-Load 2.0 文档

按任务组织，不是目录树的翻版。想了解这个项目是什么，回<a href="/" class="link">首页</a>；来这里的人是要动手的。

<div class="docs-rule">

</div>

搜索文档

<div class="g12 rows-30" style="margin-top:34px">

<a href="/docs/quickstart" class="col-4 step"></a>

<div class="n">

01

</div>

### 装起来

一条 compose 命令，五分钟拿到管理密钥

<a href="/docs/concepts" class="col-4 step"></a>

<div class="n">

02

</div>

### 配好它

分组朝上游，访问密钥朝应用，只有这两层

<a href="/docs/clients" class="col-4 step hot"></a>

<div class="n">

03

</div>

### 接上去

改基础 URL 和 API 密钥两行，客户端照旧

</div>

<div style="margin-top:62px">

<div class="idx-g">

<div class="h">

<span class="n">01</span><span class="t">开始使用</span>

</div>

<div class="idx-list">

<a href="/docs/quickstart" class="idx-item"><span class="r"><span class="t">快速开始</span></span><span class="d">从零到第一个请求成功，约十分钟</span></a><a href="/docs/concepts" class="idx-item"><span class="r"><span class="t">核心概念</span></span><span class="d">分组与访问密钥两层模型</span></a><a href="/docs/install" class="idx-item"><span class="r"><span class="t">部署</span></span><span class="d">Docker Compose、原生二进制、源码构建</span></a><a href="/docs/known-limitations" class="idx-item"><span class="r"><span class="t">已知限制与版本策略</span></span><span class="d">部署升级前确认运行边界与版本通道</span></a>

</div>

</div>

<div class="idx-g">

<div class="h">

<span class="n">02</span><span class="t">配置</span>

</div>

<div class="idx-list">

<a href="/docs/groups" class="idx-item"><span class="r"><span class="t">分组与渠道</span></span><span class="d">24 个内置渠道、分组配置与凭据池</span></a><a href="/docs/groups/subscription" class="idx-item"><span class="r"><span class="t">订阅账号</span></span><span class="d">Codex、Claude、Antigravity、Grok 的 OAuth 授权</span></a><a href="/docs/models" class="idx-item"><span class="r"><span class="t">模型管理</span></span><span class="d">模型发现、别名与价格</span></a><a href="/docs/access-keys" class="idx-item"><span class="r"><span class="t">访问密钥</span></span><span class="d">授权范围、限流与成本上限</span></a><a href="/docs/clients" class="idx-item"><span class="r"><span class="t">客户端接入</span></span><span class="d">Claude Code、Codex、Cherry Studio 等</span></a>

</div>

</div>

<div class="idx-g">

<div class="h">

<span class="n">03</span><span class="t">运维</span>

</div>

<div class="idx-list">

<a href="/docs/monitor" class="idx-item"><span class="r"><span class="t">监控与排障</span></span><span class="d">健康、请求日志、路由检查、用量成本</span></a><a href="/docs/settings" class="idx-item"><span class="r"><span class="t">运行时设置</span></span><span class="d">超时、重试、亲和等运行参数</span></a><a href="/docs/database" class="idx-item"><span class="r"><span class="t">数据库与备份</span></span><span class="d">三种驱动、DSN、迁移与备份</span></a><a href="/docs/security" class="idx-item"><span class="r"><span class="t">安全与上生产</span></span><span class="d">两把密钥、网络边界、上线清单</span></a>

</div>

</div>

<div class="idx-g">

<div class="h">

<span class="n">04</span><span class="t">深入</span>

</div>

<div class="idx-list">

<a href="/docs/internals/scheduling" class="idx-item"><span class="r"><span class="t">调度是怎么做的</span></span><span class="d">权重、亲和、重试、冷却、拉黑</span></a><a href="/docs/internals/protocols" class="idx-item"><span class="r"><span class="t">协议与转换边界</span></span><span class="d">四种协议，什么能转什么不能</span></a><a href="/docs/advanced/proxy-and-headers" class="idx-item"><span class="r"><span class="t">代理与请求头</span></span><span class="d">出站代理、覆盖层级与请求头规则</span></a>

</div>

</div>

<div class="idx-g">

<div class="h">

<span class="n">05</span><span class="t">参考</span>

</div>

<div class="idx-list">

<a href="/docs/reference/support-matrix" class="idx-item"><span class="r"><span class="t">渠道与能力矩阵</span></span><span class="d">逐渠道协议、Operation、代理与验证等级</span></a><a href="/docs/reference/env" class="idx-item"><span class="r"><span class="t">环境变量</span></span><span class="d">进程配置全表</span></a><a href="/docs/reference/api" class="idx-item"><span class="r"><span class="t">管理 API</span></span><span class="d">脚本化管理分组与密钥</span></a><a href="/docs/reference/errors" class="idx-item"><span class="r"><span class="t">错误与恢复参考</span></span><span class="d">错误码、请求日志字段、路由原因与处理方式</span></a><a href="/docs/faq" class="idx-item"><span class="r"><span class="t">常见问题</span></span><span class="d">部署、接入与排障的高频问题</span></a><a href="/docs/migrate-from-1x" class="idx-item"><span class="r"><span class="t">从 1.x 迁移</span></span><span class="d">2.0 无法原地升级，需并行部署</span></a>

</div>

</div>

</div>

<div class="notice" style="margin-top:56px">

<span class="t">1.4.x</span>

仍在使用 1.4.x？它的文档完整保留在<a href="/v1/docs" class="link">1.4.x 文档</a>。注意 2.0 无法原地升级，也不能导入 1.x 数据，迁移方式见 <a href="/docs/migrate-from-1x" class="link">从 1.x 迁移</a>。

</div>

</div>
