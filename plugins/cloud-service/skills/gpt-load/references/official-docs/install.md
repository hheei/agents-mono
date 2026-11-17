<!-- Source: https://www.gpt-load.com/docs/install?lang=zh | Snapshot: 2026-09-23 -->

<div class="docs-main">

<div class="docs-crumb">

<span class="label">文档</span><span class="label">/ 开始使用</span>

</div>

# 部署

三种装法，选一种就行。装完知道数据在哪、怎么升级，这页就算读完了。

<div class="docs-rule">

</div>

<div class="prose">

## 选哪种<a href="#pick" class="anchor" aria-label="复制本节链接">§</a>

- **Docker Compose**——推荐。一条命令起服务，升级也是一条命令
- **原生二进制**——不想装 Docker
- **Windows 安装包**——Windows 上想装成开机自启的服务
- **源码构建**——要改代码，或者需要特定平台的构建

拿不准就用第一种。

## Docker Compose<a href="#compose" class="anchor" aria-label="复制本节链接">§</a>

<div class="code-wrap">

<div class="code-cap">

<span class="label">① 起服务</span>

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

<div class="code-wrap">

<div class="code-cap">

<span class="label">② 确认在跑</span>

</div>

<div class="code-box">

curl --fail http://127.0.0.1:3001/health

复制

</div>

</div>

<div class="code-wrap">

<div class="code-cap">

<span class="label">③ 取管理密钥</span>

</div>

<div class="code-box">

docker compose exec gpt-load \\\
  sh -c <span class="s">'cat /app/data/auth.key'</span>

复制

</div>

</div>

<div class="notice notice-amber">

<span class="t">容器内会覆写两个值</span>

**这是最容易踩的坑。**容器里 `HOST` 被固定为 `0.0.0.0`、`DATA_DIR` 被固定为 `/app/data`，在 `.env`里改这两个不会生效。真正决定外部能否访问的是 Compose 的端口发布配置—— 默认只发布到宿主机的 `127.0.0.1:3001`。

</div>

## 原生二进制<a href="#binary" class="anchor" aria-label="复制本节链接">§</a>

从 <a href="https://github.com/tbphp/gpt-load/releases" target="_blank" rel="noopener noreferrer">GitHub Releases</a> 下载对应平台的构建。共五个目标：Linux 与 macOS 各有 amd64、arm64 两个， Windows 为 amd64。

**下载后先校验**，发布页附有 `SHA256SUMS`：

<div class="code-wrap">

<div class="code-cap">

<span class="label">校验并运行</span>

</div>

<div class="code-box">

<span class="c">\# 核对校验和</span>\
sha256sum -c SHA256SUMS --ignore-missing\
\
chmod +x ./gpt-load-linux-amd64\
HOST=127.0.0.1 DATA_DIR=./data ./gpt-load-linux-amd64

复制

</div>

</div>

然后打开 `http://127.0.0.1:3001`。管理密钥在 `./data/auth.key`。

Windows 上的 `gpt-load-windows-amd64.exe` 是**前台运行**的， 关掉窗口服务就停了。想让它常驻，用下面的安装包。

## Windows 安装包<a href="#windows" class="anchor" aria-label="复制本节链接">§</a>

发布页另有 `gpt-load-windows-setup.exe`， 这是 Windows 上更省事的装法：双击、确认管理员权限，它会自动完成这些事：

- **注册成 Windows 服务**——以低权限账户运行，并设置开机自启
- **建好快捷方式**——桌面和开始菜单里都有管理页面入口
- **启动服务**——装完即可用，不需要再敲命令

<div class="notice notice-amber">

<span class="t">安装过程中会显示管理密钥</span>

首次生成的管理密钥**只在安装界面上显示这一次**，关掉页面前请先保存。 错过了也能找回——它就存在 `%ProgramData%\GPT-Load\data\auth.key`。

</div>

装完之后，两个目录需要知道：

- **配置目录**——`%ProgramData%\GPT-Load`， 服务从这里读 `.env`
- **数据目录**——`%ProgramData%\GPT-Load\data`， 数据库与两把密钥都在这里

需要手动管服务时，用程序自带的子命令：

<div class="code-wrap">

<div class="code-cap">

<span class="label">管理已安装的服务</span>

</div>

<div class="code-box">

"%ProgramFiles%\GPT-Load\gpt-load.exe" service status\
"%ProgramFiles%\GPT-Load\gpt-load.exe" service stop\
"%ProgramFiles%\GPT-Load\gpt-load.exe" service start\
"%ProgramFiles%\GPT-Load\gpt-load.exe" service restart

复制

</div>

</div>

**升级**直接用新版安装包覆盖安装即可，它会先优雅停止服务再更新。**卸载**会移除程序和服务，但**保留数据目录**—— 这意味着重装后配置还在，也意味着确实要清干净时得手动删。

## 源码构建<a href="#source" class="anchor" aria-label="复制本节链接">§</a>

需要 Go 和 Node。管理台前端会被编译进二进制，所以要先构建前端：

<div class="code-wrap">

<div class="code-cap">

<span class="label">从源码构建</span>

</div>

<div class="code-box">

git clone --branch main https://github.com/tbphp/gpt-load.git\
cd gpt-load\
\
<span class="c">\# 构建管理台，产物会嵌入二进制</span>\
make build\
\
./gpt-load

复制

</div>

</div>

具体的 Go 与 Node 版本要求以仓库根目录的 `go.mod` 和 `web/package.json` 为准。

## 数据放在哪<a href="#data" class="anchor" aria-label="复制本节链接">§</a>

默认 SQLite 部署的状态都在 `DATA_DIR` 里。Compose 配置中的逻辑卷名是`gpt-load-data`，实际 Docker 卷名由 Compose 项目名决定，不一定与它相同：

- `gpt-load.db`——数据库（默认 SQLite）
- `auth.key`——未显式设置 `AUTH_KEY` 时自动生成
- `encryption.key`——未显式设置 `ENCRYPTION_KEY` 时自动生成

<div class="notice notice-amber">

<span class="t">备份要一起备</span>

加密密钥必须和数据库成套备份。使用显式 `AUTH_KEY` 或`ENCRYPTION_KEY` 时，还要从原来的安全来源单独备份； 它们不会自动写入数据卷。详见 [数据库与备份](/docs/database)。

</div>

想换成 MySQL 或 PostgreSQL，填 `DATABASE_DSN` 即可， 留空则用内置 SQLite。

## 日常运维<a href="#ops" class="anchor" aria-label="复制本节链接">§</a>

<div class="code-wrap">

<div class="code-cap">

<span class="label">常用命令</span>

</div>

<div class="code-box">

<span class="c">\# 看日志</span>\
docker compose logs -f\
\
<span class="c">\# 停服务</span>\
docker compose stop\
\
<span class="c">\# 重启</span>\
docker compose restart

复制

</div>

</div>

## 升级与回滚<a href="#upgrade" class="anchor" aria-label="复制本节链接">§</a>

不用盯着 GitHub。管理台的设置页里有系统信息，会显示当前版本，出现新版本时给出提示和发布说明链接，也可以手动检查更新。

<div class="code-wrap">

<div class="code-cap">

<span class="label">升级到最新的 2.x</span>

</div>

<div class="code-box">

docker compose pull\
docker compose up -d

复制

</div>

</div>

数据在具名卷里，升级不会丢。数据库结构变更会在启动时自动完成，不需要手工操作。

官方 Compose 使用 `2` 更新通道。GA 前，它跟随已验证的 2.0 Beta 和 RC；GA 后只跟随稳定的 2.x。镜像精确标签会去掉 Git tag 的 `v` 前缀（例如`2.0.0-beta.25`），`2.0-beta` 是 2.0 Beta 通道，且不会使用`latest`。需要固定版本时，请改用精确版本标签或镜像摘要。

[升级前查看已知限制与版本策略 →](/docs/known-limitations#tags)

数据库迁移是单向的，**回滚不能只把镜像标签改回去**。 应在升级前停机备份；需要回滚时，恢复升级前的数据库和配套密钥， 再用备份对应的旧版本启动。

装完之后：[快速开始](/docs/quickstart) 教你建第一个分组，[安全与上生产](/docs/security) 是正式使用前该走一遍的清单。

</div>

<div class="docs-pager">

[<span class="k">← 上一页</span><span class="t">核心概念</span>](/docs/concepts)<a href="/docs/known-limitations" class="next"><span class="k">下一页 →</span><span class="t">已知限制与版本策略</span></a>

</div>

</div>
