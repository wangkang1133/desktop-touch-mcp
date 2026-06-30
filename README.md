# desktop-touch-mcp

[![desktop-touch-mcp MCP server](https://glama.ai/mcp/servers/Harusame64/desktop-touch-mcp/badges/card.svg)](https://glama.ai/mcp/servers/Harusame64/desktop-touch-mcp)

[日本語](README.ja.md)

> **Windows 10/11 专用 Computer-use MCP 服务器。** 让 Claude、Cursor 或任何 MCP 客户端查看并操作你的 Windows 桌面——截图、UI Automation、Chrome CDP、键盘/鼠标、终端——采用**语义化"发现-操作"设计**避免像素坐标猜测，配备**每次操作的感知防护**在误输入到错误窗口前及时拦截。

```bash
npx -y @harusame64/desktop-touch-mcp
```

31 个工具，原生 Rust 引擎（UIA 2ms），零配置 PowerShell 回退，完整 CJK 支持，MIT 许可证。支持 **stdio**（直接 CLI 集成）和 **HTTP**（远程/局域网访问 + API 密钥认证）两种模式。

> **快速安装（无需 npm/npx）：**
> 1. 从 [GitHub Releases](https://github.com/Harusame64/desktop-touch-mcp/releases) 下载 `desktop-touch-mcp-windows.zip`
> 2. 解压到任意文件夹
> 3. 运行：`node dist/index.js`（stdio）或 `node dist/index.js --http --port 23847 --key YOUR_KEY`（HTTP）
> 4. Windows 用户：直接双击 `start.bat`

> **为什么比像素点击更好？** 两个核心理念贯穿每个工具：**发现-操作** —— `desktop_discover` 返回带短期租约的可交互实体而非原始坐标，因此 `desktop_act` 操作的是你**意图的目标**，而非它**曾经的位置**；**每次操作的感知防护**在输入到达前验证目标窗口的身份和边界，防止误窗口输入和失效坐标点击。
>
> 底层实现：Rust 原生引擎带来**82 倍平均加速**（UIA 焦点查询 2ms，SSE2 加速图像差分 13~15 倍），引擎不可用时透明回退到 PowerShell。npm 启动器仅获取匹配安装版本的 GitHub Release 标签，并在解压前验证 Windows 运行时 zip 的完整性。

---

## 功能特性

- **⚡ 高性能 Rust 原生核心** — UIA 桥接和图像差分引擎用 Rust (`napi-rs` + `windows-rs`) 编写，以 `.node` 插件加载。专用 MTA 线程直接 COM 调用消除了 PowerShell 进程启动——`getFocusedElement` **2ms** 完成（160 倍加速），`getUiElements` 用批量 BFS 算法最小化跨进程 RPC，约 **100ms** 返回完整树。图像差分使用 **SSE2 SIMD** 实现 13~15 倍吞吐。原生引擎不可用时，所有函数透明回退到 PowerShell——零配置。
- **🎯 Set-of-Marks (SoM) 视觉回退** — 游戏、RDP 会话和不可访问的 Electron 应用即使 UIA 完全失效也能返回可点击元素。`screenshot(detail="text")` 自动检测 UIA 稀疏性并激活混合非 CDP 管道：Rust 灰度 + 双线性放大 → Windows OCR → 聚类 → 红色边框标注带编号标记（`[1]`、`[2]`…）。同时返回可视化 PNG 用于空间定位和带 `clickAt` 坐标的语义 `elements[]` 列表——无需 CDP。
- **🔁 视觉目标一次确认** — 在 UIA 失效的目标上（Electron、PWA、游戏、自定义画布、RDP 窗口），`desktop_act` 可将操作后确认合并到自身响应中：可选的 `roiCapture` 携带**仅变化区域**的 PNG 裁剪加无租约的下一目标预览。Agent 一次调用即可确认点击效果并发现下一个目标，无需额外的 `desktop_state` + `screenshot`。视觉目标默认开启（`returnCapture:"on-change"`）；设 `"never"` 关闭，`"always"` 强制。结构化目标（浏览器/CDP、UIA 丰富的原生应用）不会附加——此时 `desktop_state` 更便宜精确。
- **LLM 原生设计** — 围绕 LLM 的思维方式而非人类的点击习惯设计。`run_macro` 将多个操作合入一次 API 调用；`diffMode` 仅发送自上次帧以来变化的窗口。最少 token，最少往返。
- **响应式感知图** — 为窗口或浏览器标签注册 `lensId`，传递给操作工具即可获得每次操作后的 `post.perception` 反馈。减少重复 `screenshot` / `desktop_state` 调用，防止误窗口输入和失效坐标点击。
- **完整 CJK 支持** — 使用 Win32 `GetWindowTextW` 获取窗口标题，避免 nut-js 乱码。支持 IME 旁路输入，适配日文/中文/韩文环境。
- **3 级 Token 削减** — `detail="image"`（~443 tok）/ `detail="text"`（~100~300 tok）/ `diffMode=true`（~160 tok）。只在真正需要看到像素时才发送图像。
- **1:1 坐标模式** — `dotByDot=true` 以原生分辨率捕获（WebP）。图像像素 = 屏幕坐标——无需缩放运算。配合 `mouse_click` 传入 `origin`+`scale`，服务器自动换算坐标——消除偏移和缩放错误。
- **浏览器捕获数据缩减** — `grayscale=true`（~50% 大小）、`dotByDotMaxDimension=1280`（自动缩放并保留坐标）以及 `windowTitle + region` 局部裁剪，帮助排除浏览器 UI 等无关像素。重度捕获典型缩减 50~70%。
- **Chromium 智能回退** — Chrome/Edge/Brave 上 `detail="text"` 自动跳过 UIA（太慢）并运行 Windows OCR。`hints.chromiumGuard` + `hints.ocrFallbackFired` 标记所走路径。
- **UIA 元素提取** — `detail="text"` 返回按钮名称和 `clickAt` 坐标的 JSON。Claude 无需查看截图即可点击正确元素。
- **自动停靠 CLI** — `window_dock(action='dock')` 将窗口吸附到屏幕角落并置顶。设置 `DESKTOP_TOUCH_DOCK_TITLE='@parent'` 可在 MCP 启动时自动停靠承载 Claude 的终端——进程树追踪器会找到正确的窗口。
- **紧急停止（Failsafe）** — 将鼠标移至**屏幕左上角（0,0 附近 10px 以内）**即可立即终止 MCP 服务器。这是**唯一**的安全防护——所有按键组合和应用启动不受限制。

---

## 环境要求

|| | |
||---|---|
|| 操作系统 | Windows 10 / 11（64 位） |
|| Node.js | v20+ 推荐（v22+ 已测试） |
|| PowerShell | 5.1+（Windows 捆绑）——仅作为 Rust 原生引擎不可用时的回退 |
|| Claude CLI | 需要可用的 `claude` 命令 |

> **注意：** nut-js 原生绑定需要 Visual C++ 运行时。如未安装，请从 [Microsoft](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) 下载。

---

## 安装

### 方式 A：下载预编译 zip 包（推荐）

无需 npm、npx 或构建工具。

1. 从 [GitHub Releases](https://github.com/Harusame64/desktop-touch-mcp/releases) 下载 `desktop-touch-mcp-windows.zip`
2. 解压到任意文件夹（例如 `C:\Tools\desktop-touch-mcp`）
3. 运行：
   - **stdio 模式**（用于 Claude Code、Cursor 等）：`node dist/index.js`
   - **HTTP 模式**（用于局域网/远程访问）：`node dist/index.js --http --port 23847 --key YOUR_KEY`
   - **Windows 双击**：直接运行 `start.bat`

或使用独立安装脚本：
```bash
node install.js --dir C:\Tools\desktop-touch-mcp
```

### 方式 B：npx（原始方式）

```bash
npx -y @harusame64/desktop-touch-mcp
```

npm 启动器严格按包版本获取运行时。对于包版本 `X.Y.Z`，仅获取 GitHub Release 标签 `vX.Y.Z`，下载 `desktop-touch-mcp-windows.zip`，验证其 SHA256 摘要后才解压到 `%USERPROFILE%\.desktop-touch-mcp`。已验证的缓存版本在后续运行中复用。

设置 `DESKTOP_TOUCH_MCP_HOME` 可覆盖缓存根目录。

### 注册到 Claude CLI

**使用 zip 安装（方式 A）：**

添加到 `~/.claude.json` 的 `mcpServers` 下：

```json
{
  "mcpServers": {
    "desktop-touch": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/Tools/desktop-touch-mcp/dist/index.js"]
    }
  }
}
```

**使用 npx（方式 B）：**

```json
{
  "mcpServers": {
    "desktop-touch": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@harusame64/desktop-touch-mcp"]
    }
  }
}
```

**无需系统提示。** 命令参考会通过 MCP `initialize` 响应的 `instructions` 字段自动注入给 Claude。

### 注册到其他客户端（HTTP 模式）

需要 HTTP 端点的客户端（GPT Desktop、VS Code Copilot、Hermes 等）可使用内置的 Streamable HTTP 传输：

```bash
# stdio 模式本地运行（默认）：
node dist/index.js

# HTTP 模式 — 仅限本机（无需密钥）：
node dist/index.js --http --port 23847 --host 127.0.0.1

# HTTP 模式 — 局域网/远程访问（API 密钥必填）：
node dist/index.js --http --port 23847 --host 0.0.0.0 --key YOUR_KEY

# 或通过环境变量设置密钥：
set DESKTOP_TOUCH_API_KEY=YOUR_KEY
node dist/index.js --http --port 23847 --host 0.0.0.0
```

服务器默认绑定到 `0.0.0.0`（可从任何网络接口访问）。绑定到非 localhost 地址时，API 密钥是**必填**的安全要求。客户端必须在每个请求中包含 `Authorization: Bearer *** 请求头。健康检查端点：`http://<地址>:<端口>/health`。

HTTP 模式下系统托盘图标显示活动 URL，并提供快速复制和在浏览器中打开的快捷方式。

### 开发安装

```bash
git clone https://github.com/Harusame64/desktop-touch-mcp.git
cd desktop-touch-mcp
npm install
```

安装后构建：

```bash
npm run build
```

本地检出时，直接注册构建好的服务器：

```json
{
  "mcpServers": {
    "desktop-touch": {
      "type": "stdio",
      "command": "node",
      "args": ["D:/path/to/desktop-touch-mcp/dist/index.js"]
    }
  }
}
```

> **注意：** 请将 `D:/path/to/desktop-touch-mcp` 替换为实际克隆路径。

---

## 工具列表（31 个优化工具）

> 📖 **完整参考**：[`docs/system-overview.md`](docs/system-overview.md) — 参数、返回模式、坐标计算的详尽指南。

### 🌐 World-Graph V2（主路径）
|| 工具 | 说明 |
||---|---|
|| `desktop_discover` | 观察桌面。返回带租约的可交互实体（UIA、CDP、终端、视觉 SoM）。 |
|| `desktop_act` | 通过租约验证对实体执行操作（点击、输入、拖拽、选择）。返回语义差异——视觉目标可选 `roiCapture`（变化区域 PNG 裁剪 + 下一目标预览）。 |

### 👁️ 观察与状态
|| 工具 | 说明 |
||---|---|
|| `desktop_state` | 轻量检查焦点、活动窗口、光标和自动感知注意信号。 |
|| `screenshot` | 多模式捕获：`detail='text'`（UIA/OCR）、`diffMode`（P帧）、`dotByDot`（1:1）、`background`。返回廉价的 `screenshot://by-ref/{id}` 链接而非每次内联像素。 |
|| `screenshot_query` / `screenshot_gc` | 检查和清理磁盘截图缓存：`screenshot_query` 列出已保存的捕获；`screenshot_gc` 按保留策略回收空间（默认 dry-run）。 |
|| `workspace_snapshot` | 即时会话概览：所有窗口缩略图 + UI 摘要，一次调用。 |
|| `server_status` | 诊断检查原生引擎健康和功能激活状态。 |

### ⌨️ 输入与控制
|| 工具 | 说明 |
||---|---|
|| `keyboard` | 发送键盘输入。支持后台输入（WM_CHAR）和 IME 安全剪贴板旁路。 |
|| `mouse_click` / `mouse_drag` | 精确坐标交互，支持归位和强制焦点保护。 |
|| `scroll` | 多策略：`raw`（滚轮）、`to_element`、`smart`（虚拟列表）和 `capture`（拼接）。 |
|| `click_element` | 旧版 UIA 按名称/ID 点击（实体不可用时的回退）。 |

### 🌐 浏览器 CDP（Chrome/Edge/Brave）
|| 工具 | 说明 |
||---|---|
|| `browser_open` / `browser_navigate` | 幂等调试模式启动和可靠导航。 |
|| `browser_click` / `browser_fill` / `browser_form` | 跨重绘和框架重新渲染稳定的高级 DOM 交互。 |
|| `browser_eval` | 深度检查：`js`（脚本）、`dom`（HTML）、`appState`（SPA 数据提取）。 |

### 🛠️ 工具与工作流
|| 工具 | 说明 |
||---|---|
|| `terminal` | 统一命令执行：`run`（发送+等待+读取）、`read`（OCR/UIA）和 `send`。`run` 完成模式：`quiet`、`pattern` 和 `exit`（等待命令完成 + 返回退出码）。 |
|| `wait_until` | 高效服务端轮询窗口、焦点、文本或 URL 状态变化。 |
|| `window_dock` / `focus_window` | 窗口管理：`pin`（置顶）、`unpin`、`dock`（角落吸附）和 `focus`。 |
|| `workspace_launch` | 启动应用并自动检测新窗口句柄（支持本地化标题）。 |
|| `run_macro` | 最多 50 个操作批量执行，最大化效率。 |
|| `clipboard` / `notification_show` | 系统级文本交换和用户通知。 |

### 📊 Office（Excel）
|| 工具 | 说明 |
||---|---|
|| `excel` | 通过 COM 编写和运行 Excel VBA 宏。`action='run_vba'` 将宏写入受信任位置并运行；`action='check_access_vbom'` 为只读预检。一次性设置：`node scripts/enable-access-vbom.mjs`。 |

---

## 标准工作流（v1.0.0）

v2 World-Graph（`desktop_discover` / `desktop_act`）是推荐的调度路径。四步调用适用于原生应用、浏览器和终端。

```
desktop_state          → 定向：焦点窗口/元素、模态、注意信号
desktop_discover       → 查找可操作实体（返回 lease + windows[]）
desktop_act(lease, …)  → 对实体操作（返回 attention + post.perception）
desktop_state          → 确认世界按预期变化
```

点击——优先级顺序：

```
browser_click(selector)               → Chrome / Edge（CDP，跨重绘稳定）
desktop_act(lease, action='click')    → 原生 / 对话框 / 视觉（基于实体；desktop_discover 后使用）
click_element(name | automationId)    → desktop_act 返回 ok:false 时的原生 UIA 回退
mouse_click(x, y, origin?, scale?)    → 像素级最后手段；仅用 dotByDot 截图的 origin+scale
```

恢复提示——每次观察后读取 `response.attention`，`desktop_discover`/`desktop_act` 的 `response.warnings[]`：

- `lease_expired` / `lease_generation_mismatch` / `lease_digest_mismatch` / `entity_not_found` → 重新调用 `desktop_discover`
- `modal_blocking` → `response.blockingElement`（存在时）命名了阻塞模态；通过 `click_element(name=blockingElement.name)` 关闭后重试
- `entity_outside_viewport` → `scroll(action='to_element' | 'raw')`，然后重新调用 `desktop_discover`
- `executor_failed` → 回退到 `click_element` / `mouse_click` / `browser_click`

租约生命周期：

- 每个 `desktop_discover` 响应携带 `softExpiresAtMs`（约 TTL 窗口的 60%）。超过此时间戳 LLM 应考虑重新调用 `desktop_discover`——`lease.expiresAtMs` 是唯一正确性边界。
- TTL 根据视图模式（`action`/`explore`/`debug`）、实体数量和响应载荷大小自适应。上限 60 秒。
- 设置 `DESKTOP_TOUCH_DISABLE_FUKUWARAI_V2=1` 回退到 v1 工具面（`get_windows`/`get_ui_elements`/`set_element_value`），仅用于排障——v2 是推荐默认。

---

## 终端命令完成判定（`until`）

`terminal(action='run')` 发送命令、等待完成并读取输出。如何判定"完成"由 `until` 控制：

|| 模式 | 等待内容 | 适用场景 |
||---|---|---|
|| `quiet`（默认） | 输出安静 `quietMs` 持续时长 | 短交互命令 |
|| `pattern` | 输出中预期的字符串/正则 | 有已知结束标记的长命令 |
|| `exit` | 命令真正**结束** | 需要完成或退出码时 |

> **锚定注意事项（#384）：** 最终行无尾换行的输出会将标记粘合到下一提示符（`printf X` → `Xuser@host:~$`），导致行尾锚定 pattern（`X\s*\n` / `X$`）无法绑定。*完成*检测请用 `mode:'exit'`；内容匹配用裸标记（不加 `\n`/`$`）。`mode:'pattern'` 也接受可选的 `quietMs` 稳定回退：`until:{mode:'pattern', pattern, quietMs:1000}` 在输出稳定指定时长后以 `reason:'quiet'` 完成（无 `matchedPattern`），避免等待至 `timeoutMs`。opt-in 设置（省略则继续等待 pattern；有中途静默间隔的长命令不受影响）。

### `until:{mode:'exit'}` — 真正完成 + 退出码

启发式模式容易误判常见的"追加哨兵"模式（`some-task; echo DONE` 被 `DONE` 匹配→哨兵也出现在**回显命令行**中，多行命令无法从缓冲区区分回显与真实输出）。`mode:'exit'` 结构性解决了这个问题——服务器注入一个**显示形式与输入形式不同**的完成标记，因此永远不会匹配回显（即使是多行输入），并返回真实进程退出码：

```js
terminal({
  action: 'run',
  windowTitle: 'pwsh',
  input: 'npm run build',
  until: { mode: 'exit', shell: 'powershell' },
})
// → completion: { reason: 'exited', exitCode: 0, elapsedMs: … }
//   output: 仅命令的真实输出（注入标记已去除）
```

- **显式传入 `shell`**（`'bash'` 或 `'powershell'`）。`shell:'auto'` 从终端窗口进程检测，但无法看到 SSH/WSL **内部**运行的 shell——窗口仍是本地主机外观。远程/嵌套回话请传入远端 shell（`auto` 否则可能警告并选择外层 shell）。进程真正无法识别的窗口（如 Windows Terminal）返回 `ExitModeShellAmbiguous`。
- **一等公民 shell：** `bash` 和 `powershell`。`cmd.exe` 尚不支持（`ExitModeShellUnsupported`）。
- **不安全输入立即拒绝**（`ExitModeUnsafeInput`）：未关闭引号、here-doc、`$(…)`、末尾 `\` 或 PowerShell 反引号等不会挂起，直接拒绝。
- 退出模式自行控制投递，因此投递相关的 `sendOptions`（`method`/`preferClipboard`/`pressEnter`/`chunkSize`/`pasteKey`）以 `InvalidArgs` 拒绝；焦点选项仍可使用。

---

## 浏览器 CDP 自动化

Web 自动化只需启用 Chrome/Edge 的远程调试端口——无需 Selenium 或 Playwright。

```bash
# 以 CDP 模式启动 Chrome
chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\tmp\cdp
```

```
browser_open({launch:{}})                          → 按需启动 CDP 调试模式 Chrome + 列出标签页（幂等）
browser_open()                                     → 仅连接（无 CDP 端点则失败）
browser_locate({selector:"#submit"})               → CSS 选择器 → 物理屏幕坐标
browser_click({selector:"#submit"})                → 查找 + 点击一步完成（自动聚焦浏览器）
browser_eval({action:"js", expression:"document.title"})  → 执行 JS，返回结果
browser_eval({action:"dom", selector:"#main", maxLength:5000})  → outerHTML，截断到指定字符数
browser_eval({action:"appState"})                  → 一次性 SPA 状态（Next/Nuxt/Remix/Apollo/GitHub react-app/Redux SSR）
browser_fill({selector:"#email", value:"user@example.com"})  → 填充 React/Vue/Svelte 受控输入（状态安全）
browser_overview()                                 → 链接/按钮/输入 + ARIA 切换 + 每元素的 viewportPosition
browser_search({by:"text", pattern:"..."})         → 以置信度排名 grep DOM
browser_navigate({url:"https://example.com"})      → 通过 CDP 导航（无需操作地址栏）
```

同一标签页的连续调用传入 `includeContext:false` 可省略末尾的 activeTab/readyState 注释（每次调用省 ~150 tok）。布尔/对象参数接受 LLM 友好的字符串拼写（`"true"`、`"{}"`）。

`browser_locate` 返回的坐标已考虑浏览器 UI（标签条 + 地址栏高度）和 `devicePixelRatio`，可直接传给 `mouse_click` 无需缩放。

**推荐 Web 工作流：**
```
browser_open({launch:{}}) → browser_eval({action:"dom"}) → browser_locate(selector) → browser_click(selector)
```

---

## 启动时自动停靠 CLI

MCP 启动时保持 Claude CLI 可见，同时全屏操作其他应用。在 MCP 配置中设置环境变量，停靠窗口将在每次启动时自动就位。

```json
{
  "mcpServers": {
    "desktop-touch": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@harusame64/desktop-touch-mcp"],
      "env": {
        "DESKTOP_TOUCH_DOCK_TITLE": "@parent",
        "DESKTOP_TOUCH_DOCK_CORNER": "bottom-right",
        "DESKTOP_TOUCH_DOCK_WIDTH": "480",
        "DESKTOP_TOUCH_DOCK_HEIGHT": "360",
        "DESKTOP_TOUCH_DOCK_PIN": "true"
      }
    }
  }
}
```

|| 环境变量 | 默认值 | 说明 |
||---|---|---|
|| `DESKTOP_TOUCH_DOCK_TITLE` | *（未设置=关闭）* | `@parent` 沿 MCP 进程树查找承载终端——不受标题/分支/项目变化影响。或使用字面子串。 |
|| `DESKTOP_TOUCH_DOCK_CORNER` | `bottom-right` | `top-left` / `top-right` / `bottom-left` / `bottom-right` |
|| `DESKTOP_TOUCH_DOCK_WIDTH` / `HEIGHT` | `480` / `360` | px（`"480"`）或工作区比例（`"25%"`）——4K/8K 自动适配 |
|| `DESKTOP_TOUCH_DOCK_PIN` | `true` | 置顶切换 |
|| `DESKTOP_TOUCH_DOCK_MONITOR` | 主显示器 | 来自 `desktop_state({includeScreen:true})` 的显示器 ID |
|| `DESKTOP_TOUCH_DOCK_SCALE_DPI` | `false` | 为 true 时，px 值乘以 `dpi / 96`（按显示器缩放 opt-in） |
|| `DESKTOP_TOUCH_DOCK_MARGIN` | `8` | 屏幕边缘填充（px） |
|| `DESKTOP_TOUCH_DOCK_TIMEOUT_MS` | `5000` | 目标窗口出现的最长等待 |

> **输入路由陷阱：** 置顶窗口活动时（如 Claude CLI），`keyboard(action='type')` / `keyboard(action='press')` 会将按键发送到它**而非**你想要输入的应用。始终在键盘操作前调用 `focus_window(title=...)`，然后通过 `screenshot(detail='meta')` 验证 `isActive=true`。

### 截图缓存（by-ref 存储）

`screenshot` 和其他视觉结果返回廉价的 `screenshot://by-ref/{id}` 磁盘链接而非每次内联像素，常规"观察-操作-确认"循环消耗更少 token。缓存自动限制，`screenshot_query` / `screenshot_gc` 可检查和清理。通过以下设置调整存储：

|| 环境变量 | 默认值 | 说明 |
||---|---|---|
|| `DESKTOP_TOUCH_SCREENSHOTS_DIR` | *（每用户缓存目录）* | 将缓存固定到指定文件夹。默认文件夹无法创建/写入时（如企业策略阻止），服务器自动探测 → 运行时目录 → OS 临时文件夹，使用第一个可写的 |
|| `DESKTOP_TOUCH_SCREENSHOT_MAX_COUNT` | `200` | 缓存中最多保留此数量的捕获 |
|| `DESKTOP_TOUCH_SCREENSHOT_MAX_BYTES` | `256 MiB` | 磁盘缓存总大小上限 |
|| `DESKTOP_TOUCH_SCREENSHOT_MAX_AGE_MS` | *（关闭）* | 丢弃超过此时长的捕获（ms，opt-in） |
|| `DESKTOP_TOUCH_SCREENSHOT_AUTOPRUNE` | `on` | 新捕获保存时自动清理缓存。设 `0` 禁用 |
|| `DESKTOP_TOUCH_SCREENSHOT_MIN_EVICT_AGE_MS` | `60000` | 不自动驱逐小于此年龄的捕获（ms），确保刚获得的 by-ref 链接即使同一 PC 上其他 AI/进程也在捕获时也存活足够久。`0` 禁用 |

### 自动感知（Always-on）

Phase 4 将显式 `perception_*` 工具族私有化——v0.12 自动感知层自动为每个 `desktop_state` 和 `desktop_act` 响应附加 `attention` 信号。传入 `windowTitle` 时操作工具也自动防护。不再需要手动注册/读取/遗忘 lens。

```
# desktop_state 始终返回注意信号
desktop_state() → {focusedWindow, focusedElement, modal, attention:"ok", ...}

# 操作工具传入 windowTitle 时自动防护：
keyboard({action:"type", text:"hello", windowTitle:"Notepad"})
→ post.perception:{status:"ok"}  // 防护失败时阻止不安全输入

# 注意信号 dirty/stale/settling 时，用 desktop_state 刷新：
desktop_state()  // 通过自动感知重新评估 attention
```

高级固定目标工作流，`lensId` 参数在操作工具上保留（`keyboard`、`mouse_click`、`mouse_drag`、`click_element`、`browser_click`、`browser_navigate`、`browser_eval`、`desktop_act`）。省略 `lensId` 走普通自动感知路径。底层注册表、热目标缓存和传感器循环不变；仅停用了显式 `perception_register / perception_read / perception_forget / perception_list` 工具。

---

## 鼠标归位校正

Claude 通过 `screenshot(detail='text')` 获取坐标后数秒调用 `mouse_click` 时，目标窗口可能已经移动。归位系统自动校正此问题。

|| 层级 | 启用方式 | 延迟 | 功能 |
||------|----------|------|------|
|| 1 | 始终可用（缓存存在时） | <1ms | 应用 (dx, dy) 偏移修正窗口移动 |
|| 2 | 传入 `windowTitle` 提示 | ~100ms | 窗口被遮挡时自动前置 |
|| 3 | 传入 `elementName`/`elementId` + `windowTitle` | 1~3s | UIA 重查获取窗口缩放后的新坐标 |

```
# 仅层级 1（自动）
mouse_click(x=500, y=300)

# 层级 1 + 2：隐藏窗口自动前置
mouse_click(x=500, y=300, windowTitle="记事本")

# 层级 1 + 2 + 3：窗口缩放时 UIA 重查
mouse_click(x=500, y=300, windowTitle="记事本", elementName="保存")

# 归位关闭 — 不校正
mouse_click(x=500, y=300, homing=false)
```

`homing` 参数在 `mouse_click`、`mouse_drag` 和 `scroll` 上可用。缓存在每次 `screenshot()`、`desktop_discover()`、`focus_window()`、`workspace_snapshot()` 调用时自动更新。

### `mouse_click` 图像局部坐标（origin + scale）

拍摄 `dotByDot` 截图并带 `dotByDotMaxDimension` 时，响应会打印 `origin` 和 `scale` 值。直接复制到 `mouse_click` 而无需手动计算屏幕坐标：

```
# 截图响应：
#   origin: (0, 120) | scale: 0.6667
#   要点击图像像素 (ix, iy): mouse_click(x=ix, y=iy, origin={x:0, y:120}, scale=0.6667)

mouse_click(x=640, y=300, origin={x:0, y:120}, scale=0.6667, windowTitle="Chrome")
# 服务器换算: screen = (0 + 640/0.6667, 120 + 300/0.6667) = (960, 570)
```

这消除了整类偏移和缩放错误。不传 origin/scale 时，`x`/`y` 仍为绝对屏幕像素（行为不变）。

---

## `screenshot` 关键参数

```
detail="image"          — PNG/WebP 像素（默认）
detail="text"           — UIA 元素 JSON + clickAt 坐标（无图像，~100~300 tok）
detail="meta"           — 仅标题 + 区域（最轻量，~20 tok/窗口）
dotByDot=true           — 1:1 WebP；图像像素 + origin = 屏幕像素
dotByDotMaxDimension=N  — 限制最长边（响应包含 scale 用于坐标计算）
grayscale=true          — 文本密集捕获减小约 50%（代码/AWS 控制台）
region={x,y,w,h}        — 带 windowTitle：窗口局部坐标（排除浏览器 UI）
                          不带 windowTitle：虚拟屏幕坐标
diffMode=true           — 首次调用 I-帧，之后 P-帧（仅变化窗口，~160 tok）
ocrFallback="auto"      — detail='text' 在 uiaSparse 或为空时自动触发 Windows OCR
```

**推荐工作流：**
```
workspace_snapshot()                     → 全面定位（重置 diff 缓冲区）
screenshot(detail="text", windowTitle=X) → 获取 actionable[].clickAt 坐标
mouse_click(x, y)                        → 直接点击，无需坐标计算
screenshot(diffMode=true)                → 仅检查变化（~160 tok）
```

---

## 安全机制

### 紧急停止（Failsafe）

**将鼠标移至屏幕左上角（0,0 附近 10px 以内）即可立即终止 MCP 服务器。**

- **每次工具调用前检查**：`checkFailsafe()` 在每个工具处理前运行
- **后台监视器**：500ms 轮询作为长操作的后备
- 触发半径：10px

_注：所有按键组合和应用启动均不受限制。原有的键盘黑名单（Win+R/X/S/L）和应用启动黑名单已被移除，紧急停止是唯一的安全机制。_

---

## 鼠标移动速度

所有鼠标工具（`mouse_click`、`mouse_drag`、`scroll`）接受可选的 `speed` 参数：

|| 值 | 行为 |
||---|---|
|| 省略 | 使用配置的默认值（见下） |
|| `0` | 瞬移 — `setPosition()`，无动画 |
|| `1~N` | 以 N px/秒 动画移动 |

**默认速度** 1500 px/秒。通过 `DESKTOP_TOUCH_MOUSE_SPEED` 环境变量永久更改：

```json
{
  "mcpServers": {
    "desktop-touch": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@harusame64/desktop-touch-mcp"],
      "env": {
        "DESKTOP_TOUCH_MOUSE_SPEED": "3000"
      }
    }
  }
}
```

常用值：`0` = 瞬移，`1500` = 默认（柔和），`3000` = 快速，`5000` = 极速。

---

## 强制焦点（AttachThreadInput）

Windows 前台窃取保护可能阻止 `SetForegroundWindow` 在另一窗口（如置顶的 Claude CLI）处于前台时生效，导致后续按键或点击发送到错误窗口——静默失败。

`mouse_click`、`keyboard(action='type')`、`keyboard(action='press')`、`terminal(action='send')` 均支持 `forceFocus` 参数，通过 `AttachThreadInput` 绕过此保护：

```json
{
  "name": "mouse_click",
  "arguments": {
    "x": 500,
    "y": 300,
    "windowTitle": "Google Chrome",
    "forceFocus": true
  }
}
```

如果强制尝试即使 `AttachThreadInput` 也被拒绝，响应为 `ok:false` + `code: "ForegroundRestricted"`（问题 #202 统一——与 `focus_window`、`keyboard`、`terminal_send`、`mouse_click` 形状相同）。操作本身**被抑制**，因此按键/点击永远不会到达错误窗口。通过 `focus_window` 的自动升级阶梯恢复焦点后重试。旧 `hints.warnings: ["ForceFocusRefused"]` 形状不再发出。

**通过环境变量设置全局默认：**

```json
{
  "mcpServers": {
    "desktop-touch": {
      "env": {
        "DESKTOP_TOUCH_FORCE_FOCUS": "1"
      }
    }
  }
}
```

设置 `DESKTOP_TOUCH_FORCE_FOCUS=1` 使所有四个工具默认 `forceFocus: true`，无需逐次调用修改。

**已知权衡：**

- 约 10ms `AttachThreadInput` 窗口期间，两个线程共享按键状态和鼠标捕获。快速宏序列中可能引发竞态条件（实践中罕见）。
- 用户手动操作其他应用时，禁用 `forceFocus`（或取消环境变量）以避免意外焦点切换。

---

## 自动防护

操作工具（`mouse_click`、`mouse_drag`、`keyboard(action='type'/'press')`、`click_element`、`desktop_act`、`browser_click`、`browser_navigate`）传入 `windowTitle`/`tabId` 时自动防护每次操作：

- 验证目标窗口身份（检测进程重启 / HWND 替换）
- 确认点击坐标在目标窗口矩形内
- 每次响应返回 `post.perception.status`——包括失败——使 LLM 无需截图即可恢复

**禁用自动防护** — 设置 `DESKTOP_TOUCH_AUTO_GUARD=0` 恢复 v0.11.12 行为（无自动防护）：

```json
{
  "mcpServers": {
    "desktop-touch": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@harusame64/desktop-touch-mcp"],
      "env": {
        "DESKTOP_TOUCH_AUTO_GUARD": "0"
      }
    }
  }
}
```

自动防护启用时（默认），`post.perception.status` 值：

|| 状态 | 含义 |
||---|---|
|| `ok` | 防护通过 — 目标已验证 |
|| `unguarded` | 未提供 `windowTitle`；操作未防护 |
|| `target_not_found` | 没有窗口匹配给定标题 |
|| `ambiguous_target` | 多个窗口匹配；使用更具体的标题 |
|| `identity_changed` | 窗口已被替换（进程重启/HWND 变化） |
|| `unsafe_coordinates` | 点击坐标在目标窗口矩形外 |
|| `needs_escalation` | 使用 `browser_click` 或指定 `windowTitle` |

当返回 `unsafe_coordinates` 或 `identity_changed` 时，响应可能包含 `suggestedFix.fixId`。将此 `fixId` 传入相关工具调用以批准恢复：

```json
{ "name": "mouse_click",           "arguments": { "fixId": "fix-..." } }
{ "name": "keyboard(action='type')",         "arguments": { "fixId": "fix-...", "text": "hello" } }
{ "name": "click_element",         "arguments": { "fixId": "fix-..." } }
{ "name": "browser_click", "arguments": { "fixId": "fix-..." } }
```

修复为一次性且 15 秒过期。服务器在执行前重新验证目标进程身份。

---

## 高级响应选项

### browser_eval 结构化模式

传入 `withPerception: true` 接收带 `post.perception` 的结构化 JSON 响应而非纯文本：

```json
{ "name": "browser_eval", "arguments": { "expression": "document.title", "withPerception": true } }
```

返回 `{ ok: true, result: "...", post: { perception: { status: "ok", ... } } }`。

### mouse_drag 跨窗口防护

`mouse_drag` 现在同时防护起点和终点坐标。跨越窗口边界（或到达桌面壁纸）的拖拽默认被阻止。允许有意跨窗口或范围选择拖拽：

```json
{ "name": "mouse_drag", "arguments": { "startX": 100, "startY": 100, "endX": 900, "endY": 900, "allowCrossWindowDrag": true } }
```

---

## 性能（v0.15 — Rust 原生引擎）

Rust 原生引擎（`@harusame64/desktop-touch-engine`）用持久 MTA 线程上的直接 COM 调用替代了 PowerShell 进程启动。它作为 `.node` 插件自动加载——无需配置。

### UIA 基准测试（vs PowerShell 基线）

|| 函数 | Rust 原生 | PowerShell | 加速比 |
||---|---|---|---|
|| `getFocusedElement` | **2.2 ms** | 366 ms | **163.9×** |
|| `getUiElements`（资源管理器，~60 元素） | **106.5 ms** | 346 ms | **3.3×** |
|| **加权平均** | | | **~82×** |

### 图像差分基准测试（SSE2 SIMD）

|| 函数 | Rust（SSE2） | TypeScript | 加速比 |
||---|---|---|---|
|| `computeChangeFraction`（1920×1080） | **0.26 ms** | 3.8 ms | **~15×** |
|| `dHash`（感知哈希） | **0.09 ms** | 1.2 ms | **~13×** |

### 架构

```
Claude CLI / MCP 客户端
    │  stdio 或 HTTP（MCP 协议）
    ▼
desktop-touch-mcp (TypeScript)
    │
    ├── Rust 原生引擎（.node 插件）          ← v0.15 新增
    │   ├── UIA: 通过 napi-rs + windows-rs 0.62 实现 13 个函数
    │   │   └── 专用 COM 线程（MTA）+ 批量 BFS 算法
    │   └── 图像: SSE2 SIMD 像素差分 + 感知哈希
    │
    └── PowerShell 回退（自动）
        └── .node 不可用时透明激活
```

### 为什么 `getUiElements` 只有 3.3×（不是 160×）

`getFocusedElement` 的 160× 加速来自消除 PowerShell 进程启动（~200 ms）和 .NET 程序集加载。`getUiElements` 的瓶颈转移到目标应用（如资源管理器）内的 **UIA 提供者**——无论谁请求，它都必须枚举 UI 树。Rust 引擎使用**批量 BFS 算法**（`FindAllBuildCache` + `TreeScope_Children`）最小化跨进程 RPC 调用并支持 `maxElements` 早期退出，使其在大树（VS Code、含 1000+ 元素的浏览器）上显著更快。

---

## UI 操作层（V2）

> **状态：v0.17 起默认开启。** `desktop_discover` 和 `desktop_act` 开箱即用。

V2 引入两个新工具，用基于实体的交互替代基于坐标的点击：

|| 工具 | 说明 |
||---|---|
|| `desktop_discover` | 观察窗口或浏览器标签。返回带租约的可交互实体——不含原始屏幕坐标。支持 UIA（原生）、CDP（浏览器）、终端和视觉 GPU 通道。 |
|| `desktop_act` | 与 `desktop_discover` 返回的实体交互。执行前验证租约。返回语义差异（`entity_disappeared`、`modal_appeared`、`focus_shifted`…）。视觉目标成功时可附带 `roiCapture`（变化区域 PNG 裁剪 + 无租约下一目标预览），由 `returnCapture` 控制（`on-change`，可见变化时的默认值；`never` 抑制；`always` 强制）。 |

### 点击——优先级顺序

多个工具都能执行同一点击时，按此顺序优先：

1. `browser_click(selector)` — Chrome / Edge 通过 CDP（跨重绘稳定）
2. `desktop_act(lease)` — 原生窗口、对话框、视觉目标（基于实体；`desktop_discover` 后使用）
3. `click_element(name | automationId)` — `desktop_act` 返回 `ok:false` 时的原生 UIA 回退
4. `mouse_click(x, y)` — 像素级最后手段（仅用 `dotByDot` 截图的 `origin` + `scale`）

### 禁用 V2（关闭开关）

要从工具目录中隐藏 `desktop_discover` / `desktop_act`，添加禁用标志并重启：

```json
{
  "mcpServers": {
    "desktop-touch": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@harusame64/desktop-touch-mcp"],
      "env": {
        "DESKTOP_TOUCH_DISABLE_FUKUWARAI_V2": "1"
      }
    }
  }
}
```

所有 V1 工具继续正常工作——无需重新安装。移除环境条目并重启可重新启用。

标志语义（精确匹配：仅字面字符串 `"1"` 有效）：

|| `DISABLE_FUKUWARAI_V2` | V2 状态 |
||---|---|
|| 未设置 / 非 `"1"` | **开启**（默认） |
|| `"1"` | **关闭**（关闭开关） |

### 已移除：`DESKTOP_TOUCH_ENABLE_FUKUWARAI_V2`

这是 v0.16.x 的 opt-in 开关。v0.17 起 V2 默认开启，此标志不再有效果，可安全从配置中删除。关闭 V2 请设 `DESKTOP_TOUCH_DISABLE_FUKUWARAI_V2=1`。

### V2 失败时的恢复

`desktop_act` 返回 `ok: false` 时，读取 `reason` 并遵循工具描述中内置的恢复提示。常见路径：

- `lease_expired` / `*_mismatch` / `entity_not_found` → 重调 `desktop_discover`
- `modal_blocking` → `response.blockingElement`（存在时）携带 `{ name, role, automationId? }`；用 `click_element(name=blockingElement.name)` 关闭后重试
- `entity_outside_viewport` → `scroll` / `scroll(action='to_element')`，然后重调 `desktop_discover`
- `executor_failed` → 回退到 `click_element` / `mouse_click` / `browser_click`

`desktop_discover` 警告（`visual_provider_unavailable`、`visual_provider_warming`、`cdp_provider_failed`…）时，基于坐标的工具（`screenshot(detail='text')`、`click_element`、`mouse_click`、`terminal`…）仍可作为逃生通道。

---

## 已知限制

|| 限制 | 细节 | 变通方法 |
||---|---|---|
|| 游戏/视频播放器可能在 PrintWindow 捕获中返回黑屏或挂起 | DirectX 全屏应用可能不会在 `PW_RENDERFULLCONTENT` 下重绘。窗口目标 `screenshot(detail='image')` 在 PrintWindow 返回无数据或全黑+零方差帧时已自动回退到 BitBlt，但挂起调用的 DirectX 表面不会触发回退。 | 重试 `screenshot({mode:'background', fullContent:false})` 使用旧 PrintWindow 标志；仍黑屏则 BitBlt 回退路径（默认 `mode='normal'`）至少返回屏幕上的矩形——`hints.captureFallbackReason` 会报告 `printwindow-all-black` |
|| UIA 调用开销 | Rust 原生引擎 ~2ms（焦点）/ ~100ms（树）；PowerShell 回退 ~300ms | Rust 引擎自动加载；`workspace_snapshot` 内部使用 2 秒超时 |
|| Chrome/WinUI3 UIA 元素为空 | Chromium 仅暴露有限 UIA | `screenshot(detail='text')` 自动检测 Chromium 并回退到 Windows OCR（`hints.chromiumGuard=true`）。更丰富的 DOM 访问用 `browser_open` + `browser_locate` |
|| 网站重写 `document.title` 时 Chromium 标题正则匹配失败 | 防护依赖 ` - Google Chrome` 后缀存在；部分网站将其推到长标题末尾外 | 标题被视为普通 Chrome（走 UIA）。OCR 路径仍可通过 `ocrFallback='always'` 或 UIA 返回 <5 元素时（`uiaSparse`）触发 |
|| `browser_*` CDP 工具需要 Chrome 以 `--remote-debugging-port` 启动 | 如 Chrome 已以默认配置运行且未带该标志，`browser_open` 失败。CDP E2E 测试套件在该状态下也会失败 | 先关闭 Chrome，然后 `browser_open({launch:{}})` 将以调试模式重新启动，或手动以 `--remote-debugging-port=9222 --user-data-dir=C:\tmp\cdp` 启动 |
|| 图层缓冲区 TTL | 缓冲区在 90 秒不活动后自动清除 → 下一次 `diffMode` 变为 I-帧 | 长等待后调用 `workspace_snapshot` 显式重置缓冲区 |
|| `keyboard(action='type')` / `keyboard(action='press')` 跟随焦点 | `window_dock(action='dock')(pin=true)` 使另一窗口置顶时（如 Claude CLI），按键可能被该窗口吸收 | 先调用 `focus_window(title=...)` 并通过 `screenshot(detail='meta')` 验证 `isActive=true` 再发送按键 |
|| Chrome/Edge 中 `keyboard(action='type')` 的长破折号/智能引号 | 非 ASCII 标点（长破折号 `—`、短破折号 `–`、智能引号 `"" ''`）可能被键盘加速器拦截，导致焦点跳转地址栏 | 文本包含此类字符时始终使用 `use_clipboard=true` |
|| React/Vue/Svelte 输入框的 `browser_eval(action='js')` | 设置 `element.value = ...` 或分派合成事件不会更新框架内部状态 | 使用 `browser_fill(selector, value)` — 它使用原生原型 setter + InputEvent，可正确更新 React/Vue/Svelte 状态 |

---

## Token 成本参考

|| 模式 | Token | 用途 |
||---|---|---|
|| `screenshot`（768px PNG） | ~443 tok | 一般视觉检查 |
|| `screenshot(dotByDot=true)` 窗口 | ~800 tok | 精确点击（无需坐标计算） |
|| `screenshot(diffMode=true)` | ~160 tok | 操作后差异检查 |
|| `screenshot(detail="text")` | ~100~300 tok | UI 交互（无图像） |
|| `workspace_snapshot` | ~2000 tok | 完整会话概览 |

---

## 🚀 3,000+ 下载！

本项目刚突破 **3,000+ 下载**。衷心感谢每一位尝试实验性桌面自动化 MCP 服务器、提交问题、发起 PR 和分享 bug 的人。每个 bug 报告都让下一个版本变得更好。感谢与我一起构建！

---

## 许可证

MIT
