<h1 align="center">Open Design</h1>

> 🔥 **Open Design 0.8.0 已发布。** 这一版重点上线两件事：**Plugin 体系**，让模板和工作流像文件夹一样添加、复制、分享；**Design System**，支持导入品牌规范并沉淀为可复用的 [`DESIGN.md`](../../design-systems)。 [下载 0.8.0](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0) · [参与讨论](https://github.com/nexu-io/open-design/discussions/1727)

<br/>

<p align="center">
  <img src="https://raw.githubusercontent.com/nexu-io/open-design/chore/zh-cn-readme-trim-byok-fallback/docs/assets/hero.png" alt="Open Design — Open source · Local · Claude Design, but open" width="100%" />
</p>


<p align="center">
  <a href="https://open-design.ai/"><img alt="Website" src="https://img.shields.io/badge/website-open--design.ai-111827?style=flat-square" /></a>
  <a href="https://open-design.ai/"><img alt="Download" src="https://img.shields.io/badge/download-open--design.ai-ff6b35?style=flat-square" /></a>
  <a href="https://github.com/nexu-io/open-design/releases"><img alt="Release" src="https://img.shields.io/github/v/release/nexu-io/open-design?style=flat-square&color=blueviolet&label=release&include_prereleases&display_name=tag" /></a>
  <a href="../../LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" /></a>
  <a href="https://discord.gg/qhbcCH8Am4"><img alt="Discord" src="https://img.shields.io/badge/discord-join-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="https://x.com/nexudotio"><img alt="Follow @nexudotio on X" src="https://img.shields.io/badge/follow-%40nexudotio-1DA1F2?style=flat-square&logo=x&logoColor=white" /></a>
  <a href="../../QUICKSTART.md"><img alt="Quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat-square" /></a>
</p>

<p align="center">
  <a href="../../README.md">English</a> · <b>简体中文</b> ·
  <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja-JP.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> ·
  <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> ·
  <a href="README.pt-BR.md">Português</a> · <a href="README.ru.md">Русский</a> ·
  <a href="README.ar.md">العربية</a> · <a href="README.tr.md">Türkçe</a> ·
  <a href="README.uk.md">Українська</a>
</p>

> **面向设计的桌面端 Agent 入口——Figma 和 [Claude Design][cd] 的 Agent-native 替代。**
>
> 桌面客户端优先，本地文件、GitHub 仓库、Figma 资产一键接入，为 Agent 提供充足的设计 context。已支持 macOS 和 Windows，可接入 Claude Code、Codex、Cursor Agent、OpenClaw 等 **16 个 Coding Agent**。
>
> 不只是原型工具——从想法到原型、到网页、到 HTML 视频（HyperFrames），产品设计的完整全流程都在这里完成。
>
> OpenDesign 会记住你确认过的字体、色彩、布局和交付偏好，沉淀成可复用的 DESIGN.md（Design System），用得越多越像你的团队设计助手。

---

## 📋 What

✨ **Open Design（OD）是 [Claude Design][cd] 的开源替代：桌面端原生、Agent 驱动、会沉淀团队审美与工作流。**

🖥️ **为什么是桌面客户端？** 因为设计本来就在桌面端发生。本地文件、Figma 导出、代码仓库——这些资产天然在你的设备上。OD 作为桌面客户端，能直接读取这些 context，让 Agent 发挥最大效果；同时具备终端执行、文件操作、agent 调度的全部能力。

📝 从一句需求开始，也可以直接选模板，生成原型、Live Artifact、Slides、图片、**HTML 视频**、音频。

🎬 **HTML 视频制作**——不止做原型迭代，用 HyperFrames 直接产出营销短片、产品 demo、发布宣传视频。从想法到可分享的视频，全流程在 OD 内完成。

🧠 你确认过的版本、保留的字体、色彩和布局，都会成为下一次创作的上下文。

📤 支持 HTML、PDF、PPT、ZIP、Markdown、MP4 等多种格式导出。

🤖 由 **Coding Agent 驱动**（Claude Code / Codex / Cursor Agent / OpenClaw 等任选）。Plugin 和 Design System 都是可编辑文件。

💻 **本地优先**，所有数据与运行环境完全在你自己的设备上。

<br/>

## 💡 Why

🚀 2026 年 4 月，Anthropic 发布了 [Claude Design][cd]，**第一次让 LLM 真正做设计**——不是写一篇关于设计的文章，而是**直接产出一份能用的设计稿**。

🔒 但它**闭源、付费、只跑在云端**，模型也只能用 Anthropic 自家的。**换 Agent、自部署、BYOK，全都做不到**。

🔓 Open Design 让这套能力变得开放：模型可选、密钥自管、Plugin 与设计体系可编辑，整套系统在你的设备上运行。

🤝 我们不打算重新造一个 Agent——你电脑上的 Claude Code、Codex、Cursor Agent 已经足够强大。**OD 做的，是把它们接进一个完整的设计工作流。**

🧠 它也不是一次性生成器。每个项目都会沉淀 Design System、模板、Plugin 和交付偏好。

<br/>

## 🆚 Difference from other solutions

| | Claude Design | Figma | Lovable / v0 / Bolt | **Open Design** |
|---|---|---|---|---|
| **开源** | ❌ | ❌ | ❌ | ✅ Apache-2.0 |
| **本地运行** | ❌ 仅云端 | ❌ 数据强依赖云端 | ❌ 仅云端 | ✅ 桌面客户端 + daemon |
| **Agent** | 锁 Anthropic | Make 模式锁自家 | 锁自家模型 | ✅ 16 个 CLI 任选 |
| **BYOK** | ❌ | ❌ | 部分 | ✅ Anthropic / OpenAI / Azure / Google |
| **品牌设计体系** | 内置但不可换 | 团队 Library（私域） | 主题 JSON | ✅ 129 个 [`DESIGN.md`](../../design-systems) 体系，可自定义 |
| **Plugin 扩展** | 闭源 | Plugin 市场（受平台审核） | 闭源 | ✅ 拖入文件夹即生效 |
| **HTML 视频** | ❌ | ❌ | ❌ | ✅ HyperFrames HTML→MP4 |
| **场景** | 通用设计 | UI / 原型 / 协作 | 偏代码原型 | ✅ 设计 / 视频 / 营销 / 运营 / 产品 |

<br/>

## 🖼️ Demo

按核心产物展示：

### 📐 原型（Prototype）

<table>
<tr>
<td width="50%"><a href="../../skills/gamified-app"><img src="https://raw.githubusercontent.com/nexu-io/open-design/main/docs/screenshots/skills/gamified-app.png" width="100%"/></a><br/><sub><a href="../../skills/gamified-app"><code>gamified-app</code></a> · 游戏化移动端原型——三屏暗色舞台 + XP 进度条 + 任务卡</sub></td>
<td width="50%"><a href="../../skills/social-carousel"><img src="https://raw.githubusercontent.com/nexu-io/open-design/main/docs/screenshots/skills/social-carousel.png" width="100%"/></a><br/><sub><a href="../../skills/social-carousel"><code>social-carousel</code></a> · 社交媒体三连图——1080×1080，标题串联，循环呼应</sub></td>
</tr>
</table>

### 🔴 Live Artifact

<table>
<tr>
<td width="50%"><a href="../../skills/live-dashboard"><img src="https://raw.githubusercontent.com/nexu-io/open-design/main/docs/screenshots/skills/live-dashboard.png" width="100%"/></a><br/><sub><a href="../../skills/live-dashboard"><b>Live Dashboard</b></a>——Notion 风格团队仪表盘，KPI、sparkline、活动流与任务表可按需刷新</sub></td>
<td width="50%"><a href="../../templates/live-artifacts/otd-operations-brief"><img src="https://raw.githubusercontent.com/nexu-io/open-design/main/templates/live-artifacts/otd-operations-brief/preview.png" width="100%"/></a><br/><sub><a href="../../templates/live-artifacts/otd-operations-brief"><b>On-Time Delivery Dashboard</b></a>——供应链准时交付简报，模板、数据、预览与 provenance 完整打包</sub></td>
</tr>
</table>

### 🎞️ Slide

<table>
<tr>
<td width="50%"><a href="../../skills/html-ppt-zhangzara-creative-mode"><img src="https://raw.githubusercontent.com/nexu-io/open-design/chore/zh-cn-readme-trim-byok-fallback/docs/screenshots/decks/zhangzara-creative-mode.png" width="100%"/></a><br/><sub><a href="../../skills/html-ppt-zhangzara-creative-mode"><b>Html Ppt Zhangzara Creative Mode</b></a>——高饱和创意提案 deck，纸感画布 + 多色块视觉系统</sub></td>
<td width="50%"><a href="../../skills/html-ppt-zhangzara-cobalt-grid"><img src="https://raw.githubusercontent.com/nexu-io/open-design/chore/zh-cn-readme-trim-byok-fallback/docs/screenshots/decks/zhangzara-cobalt-grid.png" width="100%"/></a><br/><sub><a href="../../skills/html-ppt-zhangzara-cobalt-grid"><b>Html Ppt Zhangzara Cobalt Grid</b></a>——钴蓝网格 editorial deck，适合研究报告与趋势发布</sub></td>
</tr>
</table>

### 🖼️ 图片

<table>
<tr>
<td width="50%"><a href="../../prompt-templates/image/anime-martial-arts-battle-illustration.json"><img src="https://cms-assets.youmind.com/media/1776756799880_c8u8w7_HGUKjjaasAAvVRa.jpg" width="100%"/></a><br/><sub><a href="../../prompt-templates/image/anime-martial-arts-battle-illustration.json"><b>Anime Martial Arts Battle Illustration</b></a>——高冲击动漫武术对战插画，动作线与能量特效完整</sub></td>
<td width="50%"><a href="../../prompt-templates/image/e-commerce-live-stream-ui-mockup.json"><img src="https://cms-assets.youmind.com/media/1776699445498_ga2ry5_HGO7H0DWkAApdKK.jpg" width="100%"/></a><br/><sub><a href="../../prompt-templates/image/e-commerce-live-stream-ui-mockup.json"><b>E-commerce Live Stream UI Mockup</b></a>——直播电商界面 mockup，弹幕、礼物、商品卡完整叠加</sub></td>
</tr>
</table>

### 🎬 HyperFrames · HTML 视频制作

> 💡 用 HTML + CSS + JS 编程式产出营销视频、产品 demo、发布宣传片。一次 30 秒视频渲染约消耗 $100 算力——这是真正的重 workload，也是桌面客户端 + Agent 最能发挥价值的场景。

<table>
<tr>
<td width="50%"><a href="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.mp4"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" width="100%"/></a><br/><sub><a href="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.mp4"><b>HyperFrames App Showcase</b></a>——12 秒三屏手机产品展示，3D 入场、功能 callout 与 logo outro 串联</sub></td>
<td width="50%"><a href="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/ui-3d-reveal.mp4"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/ui-3d-reveal.png" width="100%"/></a><br/><sub><a href="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/ui-3d-reveal.mp4"><b>HyperFrames Website-to-Video Pipeline</b></a>——15 秒网站转视频 demo，三种视口捕获后用动态转场串成营销短片</sub></td>
</tr>
</table>

### 🎥 视频

<table>
<tr>
<td width="50%"><a href="../../assets/prompt-templates/video/video-seedance-three-kingdoms-lyubu-yuanmen-archery.mp4"><img src="https://raw.githubusercontent.com/nexu-io/open-design/main/assets/prompt-templates/video/video-seedance-three-kingdoms-lyubu-yuanmen-archery-poster.jpg" width="100%"/></a><br/><sub><a href="../../assets/prompt-templates/video/video-seedance-three-kingdoms-lyubu-yuanmen-archery.mp4"><b>Three Kingdoms ARPG · Lyu Bu Yuanmen Archery</b></a>——Seedance 2.0 游戏电影感动作片段</sub></td>
<td width="50%"><a href="https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/1402.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7f63ad253175a9ad1dac53de490efac8/thumbnails/thumbnail.jpg" width="100%"/></a><br/><sub><a href="https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/1402.mp4"><b>Seedance 2.0 Japanese Romance Short Film</b></a>——15 秒日系校园纯爱电影片段</sub></td>
</tr>
</table>

<br/>

## ✨ Key Features

- 🖥️ **桌面客户端优先** ── 设计天然发生在桌面端；本地文件、Figma 导出、代码仓库直接可读，Agent 拥有终端执行、文件操作、进程调度全部能力
- 🤖 **16 个 Coding Agent** ── Claude Code · Codex · Cursor Agent · OpenClaw · Hermes Agent · Deepseek TUI · Kimi · Qoder · Copilot CLI 等，自动检测 `PATH` 上已装好的 CLI
- 🎬 **HTML 视频全流程** ── HyperFrames 让你用 HTML/CSS/JS 编程式产出营销视频、产品 demo 和发布宣传片，从脚本到 MP4 一站式交付
- 🎨 **Design System 接入与预设** ── 支持 GitHub / Figma / 本地代码导入，也预设 129 个 [`DESIGN.md`](../../design-systems) 品牌体系；企业版即将上线
- 🛠️ **模板库 + Plugin** ── 沉淀海量优质模板，内置多类 Plugin 工作流，覆盖原型、Slides、海报、仪表盘、社媒、周报、OKR、看板等
- 🎨 **多模态输出** ── HTML 原型、网页 Slides、gpt-image-2 静帧、Seedance 2.0 电影感视频、HyperFrames HTML→MP4 动效
- 🔌 **每一层都 BYOK** ── Anthropic / OpenAI / Azure / Google + 14 家媒体供应商（Volcengine / MiniMax / FishAudio / Replicate / ElevenLabs / Suno …）
- 🧠 **自进化设计记忆** ── 记住你的偏好、字体、色彩谱系、Design System 和常用模板；越用越懂你的设计判断
- 💾 **本地优先存储** ── 项目落本地 SQLite（`.od/` 目录），凭证不出你的机器
- 🖼️ **沙盒预览** ── 每个 artifact 在干净的 `srcdoc` iframe 中渲染，支持 HTML / PDF / PPT / ZIP / Markdown / MP4 多格式导出
- 📜 **Apache-2.0 开源** ── fork、自部署、商用全部允许

<br/>

## 🎯 一个完整工作流：从想法到可运行 Artifact

**Brief → 模板 / Plugin → 视觉方向 → Design System → Artifact → Handoff / 视频 → 记忆沉淀**

### 1. PM 从目标、模板和插件开始

PM 可以一句话描述目标，也可以从模板与 Plugin 选择起点：发布页、Pitch Deck、Dashboard、社媒图、PM Spec、周报、OKR 看板……

模板不是静态素材，而是带结构、约束和最佳实践的工作流。Agent 基于模板和需求生成第一版方案。

### 2. 设计师决定方向，团队沉淀品牌体系

没有完整品牌规范时，Agent 会给出几个视觉方向。设计师选定后，OD 会把色板、字体、间距和版式约束带进生成流程。

已有品牌体系时，可以在 Hub 连接 GitHub、导入 Figma 文件，或选择本地仓库文件夹，生成可复用的 Design System。

### 3. Agent 与设计师共同产出第一版 Artifact

Agent 读取 Plugin、模板、Design System 和上下文，生成真实文件，而不是只返回描述。

第一版 Artifact 由设计师、品牌资产、模板结构和 Agent 共同产出，可立即在沙盒预览里运行和修改。

### 4. Handoff 给工程，或者制作发布视频

Artifact 足够明确后，可以交给工程团队实现，也可以交给 Cursor、Claude Code、Codex 等 Coding Agent 接着开发。

需要宣传？直接用 HyperFrames 将 Artifact 转为营销视频——产品 demo、发布宣传片、社媒短视频，不用再打开另一个工具。

### 5. Open Design 会越用越懂你

你选择的方向、保留的字体、常用颜色、确认 OK 的版本，都会成为下一次生成的上下文。

用得越多，Open Design 越知道什么算「对」，也越少重复你不想要的风格。

<br/>

## 🚀 Getting started

按你的使用场景，三种方式任选其一：

### 1️⃣ 下载客户端（最快，零配置）

最简单的上手方式——下完即用，自动检测 PATH 上的 Coding Agent，本地 SQLite 持久化项目。

- 桌面版（macOS Apple Silicon · Windows x64）：[open-design.ai](https://open-design.ai/)
- 历史版本：[GitHub Releases](https://github.com/nexu-io/open-design/releases)

适合：个人用户、设计师、PM——只想点开就开始干活。

### 2️⃣ 一键部署到云端（团队共享）

把 Web 层部署到 Vercel，整套团队共用，BYOK 凭证可走环境变量；daemon 部分仍可本地或自建服务器跑，分离前后端。

<p>
  <a href="https://vercel.com/new/clone?repository-url=https://github.com/nexu-io/open-design"><img alt="Deploy to Vercel" src="https://img.shields.io/badge/Deploy_to-Vercel-000?style=for-the-badge&logo=vercel&logoColor=white" /></a>
  <a href="https://railway.app/new/template?template=https://github.com/nexu-io/open-design"><img alt="Deploy to Railway" src="https://img.shields.io/badge/Deploy_to-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" /></a>
  <a href="../../deploy/README.md"><img alt="Self-host with Docker" src="https://img.shields.io/badge/Self--host-Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" /></a>
</p>

完整部署指南：[`deploy/README.md`](../../deploy/README.md)

适合：小团队、初创公司——希望团队共用一份资产库 + 设计体系，但不想运维基础设施。

### 3️⃣ 自己动手部署（完全自主）

Clone 源码本地跑，daemon + Web + 可选 Electron 桌面壳子全栈在你机器上：

```bash
git clone https://github.com/nexu-io/open-design
cd open-design
pnpm install
pnpm tools-dev start
# → http://localhost:3000
```

完整 Quickstart：[`QUICKSTART.md`](../../QUICKSTART.md) · 架构与可选项：[`docs/architecture.md`](../architecture.md)

适合：开发者、企业自部署——需要 fork 代码、加自定义 Plugin、对接内部 LLM 网关。

<br/>

## 🗺️ Roadmap

### ✅ 已上线

- **🏠 工作台与资源库** — My Design / Templates / Brand Systems，支持模板与设计体系预览
- **🎨 Studio 创作链路** — Prototype / Slides / Media / Import / Live Artifact，支持 Tweaks · Comment · Present · Manual Edit
- **📦 Artifact 交付** — HTML / PDF / PPT / ZIP / Markdown 导出，本地持久化项目、对话、tab 与评论
- **🤝 Handoff to Coding Agent** — Artifact 可直接交给 Cursor / Claude Code / Codex 继续实现
- **🔌 执行与连接** — Harness / BYOK、14 家 Media Provider、Composio Connector、内置 Plugin、MCP、Personalization
- **🧩 Plugin 体系** — Skill 已升级为 Plugin 接入层，模板、Plugin、Design System 可复用
- **🎬 HyperFrames** — HTML→MP4 视频制作管线，用代码产出营销短片与产品 demo

### 🟡 近期重点

- **生成质量与速度** — Artifact 效果、生成速度、任务队列、Live Artifact 稳定性
- **在线部署与分享** — HTML / Slides / Artifact / 视频 一键部署，在线 URL 分享，Plugin 社媒分享
- **Design System 效果优化** — 提升抽取质量、预览表现和在 Artifact 中的应用效果
- **Plugin 生态** — 完成 Skill → Plugin 产品化升级，补齐模板型、图表型、媒体型 Plugin

### 🚧 规划中

- **图表与衍生产物** — 图表 Artifact，以及基于 HTML 生成图片、视频、PPT
- **Figma / Pencil 数据互通** — 外部设计资产可导入、可编辑、可继续生成
- **长期记忆与偏好树** — 用户画像、设计偏好、日常工作流、品牌资产 Memory Tree
- **Connector + Automation** — 数据持续刷新、定期生成、跨工具自动化
- **Organization / Enterprise** — Workspace、团队级 Plugin & Memory、企业级 Design System、项目权限

> 想反馈优先级？欢迎在 [Issues](https://github.com/nexu-io/open-design/issues) 或 [Discord](https://discord.gg/qhbcCH8Am4) 告诉我们。

<br/>

## 🤝 Contributing

### 如何开始？

| 贡献方式 | 操作 |
|---|---|
| 🐛 **修 Bug / 提 Feature** | 直接开 [Issue](https://github.com/nexu-io/open-design/issues)，Agent 会在分钟内响应 |
| 🧩 **加 Plugin** | 丢一个文件夹进 [`skills/`](../../skills/)，详见 [`skills-protocol.md`](../skills-protocol.md) |
| 🎨 **加 Design System** | 写一份 `DESIGN.md` 放进 [`design-systems/`](../../design-systems/) |
| 🎬 **加 HyperFrames 模板** | 提交视频模板到 Plugin 目录 |
| 🌐 **文档翻译** | Fork → 翻译 → PR，流程见 [`CONTRIBUTING.md`](../../CONTRIBUTING.md) |

### 🌍 Fellow 计划 — 成为全球大使

我们正在招募全球各地的 Open Design Fellow。这不是一个象征性的称号——

| 权益 | 详情 |
|---|---|
| 🖼️ **官网永久展示** | 你的名字、头像和贡献故事出现在 [open-design.ai](https://open-design.ai/) |
| 💎 **$1,000 / 年 MR 免费额度** | Claude · GPT · Gemini · DeepSeek——任何模型随意用 |
| 📣 **官方授权** | 以 Open Design 全球大使身份在你的社区推广和布道 |
| 🔗 **核心团队直连** | 产品方向优先反馈、技术问题优先支持、路线图参与权 |

> **申请方式**：持续贡献代码 / Plugin / Design System，或在你的社区积极推广 Open Design。Fellow 计划详情即将在官网正式发布。

<br/>

## 💬 Community

- 💭 [Discord](https://discord.gg/qhbcCH8Am4)——日常讨论 / Plugin 分享 / 求助
- 🐦 [@nexudotio](https://x.com/nexudotio)——产品更新

<br/>

## 👥 Contributors

感谢每一位推动 Open Design 前进的人——无论是写代码、写文档、提交 Plugin / Design System，还是抛出一个犀利的 Issue。

<p align="center">
  <b>他们在日常维护、review 和社区支持里撑起了很多关键工作。</b>
</p>

<table align="center">
<tr>
<td align="center" width="180">
  <a href="https://github.com/Nagendhra-web"><img src="https://github.com/Nagendhra-web.png" width="88" height="88" style="border-radius:50%; box-shadow:0 0 24px rgba(255, 214, 102, 0.75);" alt="Nagendhra-web" /></a><br/>
  <a href="https://github.com/Nagendhra-web"><b>@Nagendhra-web</b></a><br/>
  <sub>Maintainer</sub>
</td>
<td align="center" width="180">
  <a href="https://github.com/Sid-Qin"><img src="https://github.com/Sid-Qin.png" width="88" height="88" style="border-radius:50%; box-shadow:0 0 24px rgba(255, 214, 102, 0.75);" alt="Sid-Qin" /></a><br/>
  <a href="https://github.com/Sid-Qin"><b>@Sid-Qin</b></a><br/>
  <sub>Maintainer</sub>
</td>
</tr>
</table>

也谢谢所有贡献者：你们提交的代码、文档、Issue、Plugin 和 Design System，正在把 Open Design 一点点变得更好。

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&max=500&columns=18&anon=0&cache_bust=2026-05-08" alt="Open Design contributors" />
</a>

<br/>

第一次提 PR？欢迎。[`good-first-issue` / `help-wanted`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22%2C%22help+wanted%22) 标签是入口。

<br/>

## 📊 GitHub Stats

<a href="https://repobeats.axiom.co"><img alt="Repobeats analytics" src="https://repobeats.axiom.co/api/embed/c59ecce40d164b136afd44a153b3b01827e2ec51.svg" width="100%" /></a>

<br/>

## ⭐ Star History

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date" width="640" />
  </picture>
</a>

<br/>

## 🙏 Built on

Open Design 是开源接力中的一棒。它能跑得起来，离不开以下作者们的先行工作——他们的项目，直接构成了 OD 的底层：

<table>
<tr>
<td width="25%" align="center" valign="top">
  <a href="https://www.anthropic.com/"><img src="https://github.com/anthropics.png" width="64" height="64" style="border-radius:50%" alt="Anthropic" /></a><br/>
  <a href="https://www.anthropic.com/"><b>Anthropic</b></a><br/>
  <sub><a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a></sub><br/>
  <sub>本仓库为之提供开源替代的闭源产品——artifact-first 心智的开创者。</sub>
</td>
<td width="25%" align="center" valign="top">
  <a href="https://github.com/alchaincyf"><img src="https://github.com/alchaincyf.png" width="64" height="64" style="border-radius:50%" alt="alchaincyf" /></a><br/>
  <a href="https://github.com/alchaincyf"><b>@alchaincyf</b>（花叔）</a><br/>
  <sub><a href="https://github.com/alchaincyf/huashu-design"><code>huashu-design</code>·画术</a></sub><br/>
  <sub>设计哲学的核心——Junior-Designer 工作流、5 步品牌资产协议、anti-AI-slop checklist、五维自评。</sub>
</td>
<td width="25%" align="center" valign="top">
  <a href="https://github.com/op7418"><img src="https://github.com/op7418.png" width="64" height="64" style="border-radius:50%" alt="op7418" /></a><br/>
  <a href="https://github.com/op7418"><b>@op7418</b>（歸藏）</a><br/>
  <sub><a href="https://github.com/op7418/guizang-ppt-skill"><code>guizang-ppt-skill</code></a></sub><br/>
  <sub>Magazine-web-PPT 能力已作为 Plugin 接入，Deck 模式的默认实现，P0/P1/P2 checklist 文化的来源。</sub>
</td>
<td width="25%" align="center" valign="top">
  <a href="https://github.com/multica-ai"><img src="https://github.com/multica-ai.png" width="64" height="64" style="border-radius:50%" alt="multica-ai" /></a><br/>
  <a href="https://github.com/multica-ai"><b>@multica-ai</b></a><br/>
  <sub><a href="https://github.com/multica-ai/multica"><code>multica</code></a></sub><br/>
  <sub>Daemon + adapter 架构、PATH 扫描式 agent 检测、agent-as-teammate 世界观。</sub>
</td>
</tr>
<tr>
<td width="25%" align="center" valign="top">
  <a href="https://github.com/OpenCoworkAI"><img src="https://github.com/OpenCoworkAI.png" width="64" height="64" style="border-radius:50%" alt="OpenCoworkAI" /></a><br/>
  <a href="https://github.com/OpenCoworkAI"><b>@OpenCoworkAI</b></a><br/>
  <sub><a href="https://github.com/OpenCoworkAI/open-codesign"><code>open-codesign</code></a></sub><br/>
  <sub>第一个开源的 Claude Design 替代——流式 artifact 循环、沙盒 iframe 预览、实时 agent 面板。</sub>
</td>
<td width="25%" align="center" valign="top">
  <a href="https://github.com/VoltAgent"><img src="https://github.com/VoltAgent.png" width="64" height="64" style="border-radius:50%" alt="VoltAgent" /></a><br/>
  <a href="https://github.com/VoltAgent"><b>@VoltAgent</b></a><br/>
  <sub><a href="https://github.com/VoltAgent/awesome-design-md"><code>awesome-design-md</code></a></sub><br/>
  <sub>9 段式 <code>DESIGN.md</code> schema 的来源，69 套产品体系的导入入口。</sub>
</td>
<td width="25%" align="center" valign="top">
  <a href="https://github.com/farion1231"><img src="https://github.com/farion1231.png" width="64" height="64" style="border-radius:50%" alt="farion1231" /></a><br/>
  <a href="https://github.com/farion1231"><b>@farion1231</b></a><br/>
  <sub><a href="https://github.com/farion1231/cc-switch"><code>cc-switch</code></a></sub><br/>
  <sub>跨多个 agent CLI 的 symlink 式能力分发，Plugin 接入形态的灵感与实现参考。</sub>
</td>
<td width="25%" align="center" valign="top">
  <a href="https://github.com/anthropics"><img src="https://github.com/anthropics.png" width="64" height="64" style="border-radius:50%" alt="Anthropic" /></a><br/>
  <a href="https://github.com/anthropics"><b>@anthropics</b></a><br/>
  <sub><a href="https://docs.anthropic.com/en/docs/claude-code/skills">Claude Code Skills</a></sub><br/>
  <sub><code>SKILL.md</code> 规范是早期基础，现在已升级为 Open Design 的 Plugin 接入层。</sub>
</td>
</tr>
</table>

每一个想法、每一行借鉴的代码，背后都有一位真实的作者。如果你喜欢 Open Design，请也去给他们一个 Star ⭐

<br/>

## 📄 License

[Apache-2.0](../../LICENSE)

当 Anthropic、OpenAI、Google 把最先进的 AI 设计能力锁进付费墙之后，世界仍然需要另一种声音——**让最前沿的技术回到每一个开发者、设计师、创作者的桌上**。

我们希望有一天能让一个独立设计师不再为订阅费焦虑、让一个还在读书的年轻人也能用上一线工具，做出他人生中第一份拿得出手的作品。

> **Take it. Build with it. Make it yours.**

<br/>

## 🔗 Staying Ahead

<p align="center">
  Star Open Design on GitHub，第一时间获取新版本通知。
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/nexu-io/open-design/main/docs/assets/star-us.gif" alt="Star Open Design on GitHub" width="640" />
</p>

[cd]: https://www.anthropic.com/news/claude-design-anthropic-labs
