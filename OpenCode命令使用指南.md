# OpenCode 命令使用指南（含案例）

> 本文按本机 **OpenCode CLI 1.18.35** 的实际帮助信息整理。CLI 会随版本演进；如某选项与本机不一致，先运行 `opencode --help` 或 `opencode <命令> --help` 核对。本文的 TUI 斜杠命令是交互界面内输入的命令，与终端里的 `opencode ...` 命令不同。

## 目录

1. [快速开始](#1-快速开始)
2. [TUI 交互命令](#2-tui-交互命令)
3. [常用 CLI 命令](#3-常用-cli-命令)
4. [实战流程](#4-实战流程)
5. [自定义斜杠命令](#5-自定义斜杠命令)
6. [权限与安全注意事项](#6-权限与安全注意事项)
7. [故障排查](#7-故障排查)

---

## 1. 快速开始

### 查看版本与帮助

```bash
opencode --version
opencode --help
opencode run --help
```

每个子命令都可以单独查看帮助，例如 `opencode mcp add --help`。

### 在项目中启动 TUI

```bash
opencode /home/wq/physics-work
```

不带路径时，会在当前目录启动：

```bash
opencode
```

建议从具体项目目录启动，避免把整个主目录当成工作区。

### 基本操作

启动后直接输入自然语言任务，例如：

```text
先阅读项目结构和 README，说明应用入口、主要模块及测试命令。只分析，不修改文件。
```

输入 `!` 开头的内容可在 TUI 中运行 Shell 命令，输出会加入对话：

```text
!git status --short
!npm test
```

---

## 2. TUI 交互命令

在 OpenCode 交互界面中输入 `/` 后选择命令；输入 `/help` 可查看本机支持的命令。

| 命令 | 作用 | 例子 |
|---|---|---|
| `/help` | 查看帮助 | `/help` |
| `/connect` | 添加或连接模型提供方 | `/connect` |
| `/models` | 浏览可用模型 | `/models` |
| `/sessions` | 查看并切换会话；也可用 `/resume`、`/continue` | `/sessions` |
| `/new` | 开始新会话；也可用 `/clear` | `/new` |
| `/compact` | 压缩当前会话上下文；也可用 `/summarize` | `/compact` |
| `/undo` | 撤销上一条用户消息及后续响应/文件修改 | `/undo` |
| `/redo` | 恢复刚刚撤销的内容 | `/redo` |
| `/export` | 导出当前对话为 Markdown 并用编辑器打开 | `/export` |
| `/share`、`/unshare` | 分享或取消分享当前会话 | `/share` |
| `/init` | 引导创建或更新项目 `AGENTS.md` | `/init` |
| `/editor` | 用 `$EDITOR` 指定的编辑器编写长提示 | `/editor` |
| `/details` | 显示/隐藏工具执行细节 | `/details` |
| `/thinking` | 显示/隐藏模型提供的思考内容 | `/thinking` |
| `/themes` | 切换主题 | `/themes` |
| `/exit` | 退出；也可用 `/quit`、`/q` | `/exit` |

常见快捷键（默认 leader 为 `Ctrl+X`）：

| 快捷键 | 功能 |
|---|---|
| `Ctrl+X`, `C` | 压缩会话 |
| `Ctrl+X`, `E` | 打开外部编辑器 |
| `Ctrl+X`, `Q` | 退出 |
| `Ctrl+X`, `X` | 导出对话 |
| `Ctrl+X`, `M` | 选择模型 |
| `Ctrl+X`, `N` | 新建会话 |
| `Ctrl+X`, `R` | 重做 |
| `Ctrl+X`, `L` | 列出会话 |
| `Ctrl+X`, `U` | 撤销 |
| `Ctrl+P` | 打开命令面板 |

> **注意：** `/undo` 和 `/redo` 会还原文件变更，依赖 Git 管理快照；使用前检查 `git status`，重要修改先提交或备份。

---

## 3. 常用 CLI 命令

### 3.1 `opencode run`：执行一次任务

适合快速提问、脚本自动化或明确指定模型/Agent。

```bash
opencode run "总结这个项目的结构，并列出主要测试命令"
```

指定模型和 Agent：

```bash
opencode run --model provider/model --agent build "检查登录流程中的边界条件"
```

`provider/model` 需要替换成 `opencode models` 中实际可用的 ID。

附带一个或多个文件：

```bash
opencode run --file src/main.ts --file package.json "解释应用启动流程，并指出潜在问题"
```

使用 JSON 事件格式供脚本处理：

```bash
opencode run --format json "列出项目中的测试文件"
```

选择模型变体（取决于提供方支持）：

```bash
opencode run --model provider/model --variant high "分析这段代码的并发安全性"
```

继续最近的会话：

```bash
opencode run --continue "接着完成上次的分析，先检查当前工作区状态"
```

按会话 ID 继续，或从旧会话分叉出新会话：

```bash
opencode run --session SESSION_ID "继续调查这个问题"
opencode run --session SESSION_ID --fork "基于原讨论另开一条实现方案"
```

`--fork` 必须与 `--continue` 或 `--session` 一起使用。

### 3.2 `opencode models`：列出模型

```bash
opencode models
opencode models opencode-go
opencode models --refresh
opencode models --verbose
```

`--refresh` 会刷新模型列表缓存；`--verbose` 会显示更多元数据。

### 3.3 Provider 登录与凭证

```bash
opencode auth list
opencode auth login
opencode auth login --provider PROVIDER_ID
opencode auth logout PROVIDER_ID
```

`auth` 是 `providers` 命令的别名。OAuth 或需要交互选择登录方式时，按终端提示完成。不要把 API Key 直接写进聊天记录或共享脚本。

### 3.4 会话管理与导入导出

```bash
opencode session list
opencode session list --max-count 20 --format table
opencode session list --format json
opencode session delete SESSION_ID
```

导出指定会话为 JSON：

```bash
opencode export SESSION_ID > session.json
```

需要分享或提交前，优先脱敏导出：

```bash
opencode export --sanitize SESSION_ID > session-sanitized.json
```

从本地 JSON 或分享链接导入：

```bash
opencode import session.json
opencode import 'https://opencode.ai/share/...'
```

TUI 内的 `/export` 则导出当前对话为 Markdown；这与 CLI 的 JSON 导出用途不同。

### 3.5 Agent 管理

```bash
opencode agent list
opencode agent create --description "只读代码审查助手" --mode subagent
```

指定生成文件位置、模型和工具权限：

```bash
opencode agent create \
  --path .opencode/agents/reviewer.md \
  --description "审查代码缺陷与安全风险" \
  --mode subagent \
  --model provider/model \
  --permissions "read,glob,grep"
```

权限列表以 `opencode agent create --help` 为准。Agent 的配置文件生成后，可检查并按项目需要调整。

### 3.6 MCP 管理

列出 MCP Server 及连接状态：

```bash
opencode mcp list
```

添加远程 Server（按服务商提供的 URL 和 Header 替换示例值）：

```bash
opencode mcp add docs --url https://mcp.example.com \
  --header 'Authorization=Bearer YOUR_TOKEN'
```

添加本地进程型 Server 时，通过 `--env KEY=VALUE` 传环境变量；实际启动命令/参数根据 `opencode mcp add` 的交互提示配置。OAuth 型 Server：

```bash
opencode mcp auth docs
opencode mcp debug docs
opencode mcp logout docs
```

> 不要把真实 Token 写入公开文档或提交到 Git。上面的 `YOUR_TOKEN` 只是占位文本。

### 3.7 Server、Web 和远程连接

在一个终端启动本机 Server：

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

另开终端连接它：

```bash
opencode attach http://localhost:4096
```

启动 Web 界面：

```bash
opencode web --hostname 127.0.0.1 --port 4096
```

`serve`/`web` 默认监听随机端口；指定端口便于客户端连接。远程部署时，不要未经认证就将服务暴露到公网；监听地址、认证变量和 CORS 设置应按本机 `opencode serve --help` 及安全要求配置。

### 3.8 GitHub、插件与版本维护

```bash
opencode pr 123
```

在 GitHub 仓库上下文中获取并切换到对应 PR 分支，然后启动 OpenCode。GitHub Agent 的安装/启动命令：

```bash
opencode github install
opencode github run
```

安装插件 npm 模块：

```bash
opencode plugin <npm-module-name>
opencode plugin <npm-module-name> --global
```

升级 OpenCode：

```bash
opencode upgrade
opencode upgrade --method npm
opencode upgrade 1.18.35
```

`--method` 可按安装方式选择 `curl`、`npm`、`pnpm`、`bun`、`brew`、`choco` 或 `scoop`。指定版本示例仅演示语法；通常优先使用不带目标版本的升级命令。

OpenCode 的可执行包可能内嵌 Bun 运行时；这种情况下，单独执行 `bun upgrade` 不一定会改变 OpenCode 实际使用的 Bun 版本，应升级 OpenCode 本身并检查新崩溃报告中的运行时版本。

### 3.9 诊断命令

```bash
opencode debug info
opencode debug paths
opencode debug config
opencode debug startup
opencode debug lsp
opencode debug v2
```

- `info`：版本、操作系统及插件等信息。
- `paths`：数据、配置、缓存、日志等目录。
- `config`：显示合并后的有效配置。
- `startup`：查看启动诊断信息。
- `lsp`：LSP 调试工具；`v2`：V2 目录/内置插件相关调试。

排查启动或运行问题时，可提高日志级别：

```bash
opencode --print-logs --log-level DEBUG
```

也可以在 `run` 等命令上使用通用选项：

```bash
opencode run --print-logs --log-level DEBUG "复现并分析这个错误"
```

数据库路径：

```bash
opencode db path
```

`opencode db` 可用于数据库诊断；除非明确知道 SQL 的影响，不要直接修改内部数据库。

---

## 4. 实战流程

### 案例 A：先了解项目，再做小范围修改

```bash
opencode /home/wq/physics-work
```

TUI 中先输入：

```text
先检查项目结构、Git 状态和测试命令。请不要修改文件，先用简短列表说明你准备检查的内容。
```

了解情况后再给具体任务；需要时用 `!git status --short` 查看工作区。这样能先发现现有本地改动，避免覆盖用户工作。

### 案例 B：快速检查单个文件

```bash
opencode run --file acceleration-force-mass.html \
  "检查物理公式、边界条件和无障碍标签；只列出问题及行号，不改文件"
```

### 案例 C：继续旧会话，但保留原讨论

```bash
opencode session list --max-count 10
opencode run --session SESSION_ID --fork \
  "基于之前的分析，提出一个更小范围的修复方案；先不要修改文件"
```

### 案例 D：运行任务并保留结构化输出

```bash
opencode run --format json \
  "读取 package.json，指出 test 和 build 命令" > opencode-result.json
```

输出文件可能包含会话内容；对外提供前应检查并脱敏。

### 案例 E：排查“模型无法响应”

```bash
opencode debug info
opencode auth list
opencode models --refresh
opencode --print-logs --log-level DEBUG
```

逐项核对 CLI 版本、Provider 登录状态、模型 ID、网络/证书错误。Provider 返回“模型不可用”“凭证无效”“请求过频”和 Bun 自身崩溃是不同故障类别，需要分别处理。

---

## 5. 自定义斜杠命令

在项目中创建 `.opencode/commands/review.md`：

```markdown
---
description: 检查指定文件的缺陷和测试覆盖
agent: build
---
请审查以下目标：$ARGUMENTS

优先检查错误处理、边界条件、数据安全和缺失测试。先报告问题与依据；未经要求不要修改文件。
```

重新打开或刷新 OpenCode 后，在 TUI 输入：

```text
/review src/auth.ts
```

`$ARGUMENTS` 会替换成命令后提供的参数。全局命令可放在 `~/.config/opencode/commands/`。也可在 `opencode.json` 的 `command` 项中配置自定义命令；团队协作时项目内 Markdown 命令便于版本管理。

---

## 6. 权限与安全注意事项

1. `--auto` 会自动批准未显式拒绝的权限，CLI 帮助明确标记为危险选项。只在可信项目、理解将执行的操作时使用。
2. `--file`、会话导出和分享可能包含代码、路径、提示词或敏感信息；分享前检查内容，必要时使用 `opencode export --sanitize`。
3. 不要把 API Key、密码、Bearer Token 写进提示词、命令历史或可提交文件。MCP Token 优先使用安全的本机凭证机制。
4. `/undo` 与 `/redo` 会改动工作区文件，执行前确认 Git 状态；不要假设它们只撤回聊天文字。
5. 远程服务不要直接裸露在公网；将服务限制在本机或可信网络，并配置认证、CORS 与防火墙。

---

## 7. 故障排查

### 命令不存在或选项不兼容

```bash
opencode --version
opencode --help
opencode 子命令 --help
```

核对实际二进制路径：

```bash
command -v opencode
```

### 配置来源不清

```bash
opencode debug paths
opencode debug config
```

OpenCode 可能合并全局配置、项目配置及 `.opencode` 目录中的配置；检查有效配置而非只看单个文件。

### 启动慢或意外退出

```bash
opencode debug startup
opencode --print-logs --log-level DEBUG
```

记录退出前错误、CLI 版本、操作系统和崩溃报告链接。若输出包含 `Bun has crashed`、`Segmentation fault`，这是运行时级崩溃，与普通的模型 API 报错应分开排查。

### 官方资料

- [OpenCode CLI](https://opencode.ai/docs/cli/)
- [TUI 使用说明](https://opencode.ai/docs/tui/)
- [自定义命令](https://opencode.ai/docs/commands/)
- [OpenCode 配置](https://opencode.ai/docs/config/)
