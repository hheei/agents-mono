<!-- Source: https://www.gpt-load.com/docs/migrate-from-1x?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 参考</span>

</div>

# 从 1.x 迁移

2.0 是完全重写的版本。它不能就地升级 1.x，也没有数据导入工具——正确做法是并行部署、验证后切流量。

<div class="docs-rule">

</div>

<div class="prose">

<div class="notice notice-amber">

<span class="t">重要</span>

**不要把 2.0 指向 1.x 的数据目录或数据库。**两者的数据结构完全不同，2.0 不会读取、更不会转换 1.x 的数据。 直接复用旧数据目录可能导致启动失败或数据损坏。

</div>

[查看 2.0 已知限制与版本策略 →](/docs/known-limitations)

## 先说结论<a href="#no" class="anchor" aria-label="复制本节链接">§</a>

- **不能原地升级**——不存在「拉个新镜像就升上去」这条路
- **没有数据导入工具**——渠道、密钥、分组都需要在 2.0 里重新配置
- **1.x 仍然可用**——维护线继续存在， 文档保留在 [1.4.x 文档](/v1/docs)，不急的话可以先不动

需要做的是：**另起一套 2.0，配好、验证、再把流量切过去**， 旧的那套在回滚窗口内保持不动。

## 为什么不能升级<a href="#why" class="anchor" aria-label="复制本节链接">§</a>

2.0 重写了数据模型。最根本的变化是**概念层级从一层变成了两层**： 1.x 里「分组」同时承担了上游配置和对外授权两个职责； 2.0 把它拆成了**分组**（朝上游）和**访问密钥**（朝应用）。

这不是加几个字段能兼容的差异——旧数据里没有任何信息可以推导出 「哪些应用该被授权用哪些分组」。所以与其提供一个会猜错的导入工具， 不如让你在 2.0 里明确配一遍。配置量通常不大，而且只需要做一次。

## 概念对照<a href="#map" class="anchor" aria-label="复制本节链接">§</a>

<div class="tbl-wrap">

| 1.x | 2.0 对应 | 说明 |
|----|----|----|
| 分组 | 分组 + 访问密钥 | 一个 1.x 分组通常拆成「一个分组」＋「一把访问密钥」 |
| 分组里的密钥池 | 分组的凭据池 | 概念一致，直接重新粘贴即可 |
| 渠道类型 | 分组的渠道字段 | **2.0 没有独立的渠道菜单**，它是建分组时的选项 |
| 对外的分组名 | 访问密钥 | 应用侧改为持有一把密钥，不再拼分组名 |

</div>

三层还是两层这件事容易记混，详见 [核心概念](/docs/concepts)。

## 请求地址的变化<a href="#url" class="anchor" aria-label="复制本节链接">§</a>

这是应用侧**唯一必须改的东西**。1.x 需要把分组名拼进路径， 2.0 不需要：

<div class="code-wrap">

<div class="code-cap">

<span class="label">应用侧的改动</span>

</div>

<div class="code-box">

<span class="c">\# 1.x：地址里带分组名</span>\
http://host:3001/proxy/<span class="s">你的分组名</span>/v1/chat/completions\
\
<span class="c">\# 2.0：固定地址，用哪个分组由访问密钥和模型名决定</span>\
http://host:3001/v1/chat/completions

复制

</div>

</div>

换句话说，2.0 里**应用只需要一个基础 URL 和一把访问密钥**。 以后你在管理台增删分组、换服务商，应用侧都不用再动。

## 并行部署<a href="#plan" class="anchor" aria-label="复制本节链接">§</a>

关键是**两套实例的四样东西必须完全分开**，任何一样共用都可能出问题：

- **端口**——2.0 用一个新端口，别占用 1.x 正在用的
- **数据目录 / Docker 卷**——必须是全新的，不要复用
- **数据库**——用新库；哪怕都是 MySQL 也要分开建库
- **OAuth 回调端口**——若要用订阅账号，注意端口是独占的， 见 [订阅账号](/docs/groups/subscription)

<div class="code-wrap">

<div class="code-cap">

<span class="label">以 Compose 为例：换目录、换端口</span>

</div>

<div class="code-box">

<span class="c">\# 1.x 保持原样运行，不要动它</span>\
\
<span class="c">\# 2.0 clone 到另一个目录</span>\
git clone --depth 1 --branch main \\\
  https://github.com/tbphp/gpt-load.git gpt-load-v2\
cd gpt-load-v2\
cp .env.example .env\
\
<span class="c">\# 在 .env 里把端口改成未占用的，例如 3002</span>\
<span class="c">\# PORT=3002</span>\
\
docker compose up -d

复制

</div>

</div>

起来之后按 [快速开始](/docs/quickstart) 配置： 建分组、填密钥、选模型、发访问密钥。

## 切流量前的验证<a href="#verify" class="anchor" aria-label="复制本节链接">§</a>

逐项确认，再动生产流量：

1.  **每个分组都能跑通**——用真实模型各发一个请求，不要只测一个分组
2.  **模型名对得上**——2.0 里模型是分组级声明的， 确认应用请求的模型名在对应分组里已开放
3.  **协议匹配**——访问密钥要勾选应用实际使用的协议
4.  **看一眼监控**——请求日志里确认路由走向符合预期， 见 [监控与排障](/docs/monitor)
5.  **过一遍上生产清单**——特别是密钥备份与网络边界， 见 [安全与上生产](/docs/security)

建议先把**一个非关键应用**切到 2.0 跑一段时间， 确认无误后再切其余的。

## 回滚<a href="#rollback" class="anchor" aria-label="复制本节链接">§</a>

因为是并行部署，回滚就是**把应用的地址和密钥改回 1.x**， 没有数据迁移需要撤销。

<div class="notice notice-amber">

<span class="t">别急着删</span>

流量切完之后，**1.x 那套至少再保留一到两周**。 确认 2.0 在真实负载下稳定、没有遗漏的应用还在连旧实例，再考虑下线。 删除前记得备份它的数据目录。

</div>

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">常见问题</span>](/docs/faq)

</div>

</div>
