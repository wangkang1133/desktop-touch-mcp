# desktop-touch-mcp

[![desktop-touch-mcp MCP server](https://glama.ai/mcp/servers/Harusame64/desktop-touch-mcp/badges/card.svg)](https://glama.ai/mcp/servers/Harusame64/desktop-touch-mcp)

[日本語](README.ja.md)

> **Windows 计算机操控 MCP 服务器。** 让 Claude、Cursor 或任何 MCP 客户端看到并操控你的 Windows 10/11 桌面——屏幕截图、UI Automation、Chrome CDP、键盘/鼠标、终端——采用**先发现后操作的语义化定位**避免猜测像素坐标，以及**每次操作的感知守护**在错误窗口输入发生前拦截。

```bash
npx -y @harusame64/desktop-touch-mcp
```

31 个工具，原生 Rust 引擎（UIA 2ms），零配置 PowerShell 回退，完整 CJK 支持，MIT 许可。将上述命令添加到你的 Claude / Cursor / VS Code Copilot 配置中，Claude 就能操控记事本、Excel、Chrome、Windows Terminal 及你机器上的任何其他应用。

> **为什么比像素点击更好？** 两个核心理念贯穿每个工具：**先发现后操作**——`desktop_discover` 返回带有短期租约的可交互实体而非原始坐标，`desktop_act` 操作的是你*想要什么*，而不是它在*哪里*——以及**每次操作的感知守护**，在输入落地前验证目标窗口的身份和边界，在错误窗口输入和过期坐标点击发生前拦截。
>
> 底层实现：Rust 原生引擎带来 **82 倍平均加速**（UIA 焦点查询 2ms，SSE2 加速图像差异检测 13-15 倍），引擎不可用时透明回退到 PowerShell。npm 启动器仅获取与安装版本匹配的 GitHub Release 标签，并在解压前验证 Windows 运行时 zip 的完整性。

---

## 🔧 相比原版的修改（Fork 改进）

本仓库是 [Harusame64/desktop-touch-mcp](https://github.com/Harusame64/desktop-touch-mcp) 的 Fork，进行了以下增强：

### 1. 支持 0.0.0.0 远程访问

原版 HTTP 模式仅监听 `127.0.0.1`（仅本地访问），本 Fork 改为默认监听 `0.0.0.0`，允许来自任意网络接口的远程连接。

- **新增 `--host` 参数**：可自定义绑定地址（默认 `0.0.0.0`）
- **移除 DNS Rebinding 限制**：原版仅允许 `localhost`/`127.0.0.1` 的 Host 头请求，现已放开
- **放宽 CORS 策略**：原版仅允许 localhost 来源，现已对所有 Origin 均允许（由 API Key 保障安全）

### 2. 新增 API 密钥认证

当服务器暴露到网络时，**强烈建议**启用 API 密钥认证以防止未授权访问：

- **新增 `--api-key` 参数**：启动时通过命令行指定密钥
- **支持环境变量**：通过 `MCP_API_KEY` 环境变量设置密钥
- **认证方式**：
  - HTTP 请求头 `X-API-Key: your-secret-key`
  - URL 查询参数 `?api_key=your-secret-key`
- **未提供正确密钥**：返回 `401 Unauthorized` 错误

```bash
# 通过命令行指定密钥：
npx -y @harusame64/desktop-touch-mcp --http --api-key your-secret-key

# 或通过环境变量：
MCP_API_KEY=your-secret-key npx -y @harusame64/desktop-touch-mcp --http

# 完整远程访问配置：
npx -y @harusame64/desktop-touch-mcp --http --host 0.0.0.0 --port 8080 --api-key your-secret-key
```

---

## 功能特性

- **⚡ 高性能 Rust 原生引擎** — UIA 桥接和图像差异引擎使用 Rust 编写（`napi-rs` + `windows-rs`），作为原生 `.node` 插件加载。专用 MTA 线程的直接 COM 调用消除了 PowerShell 进程创建——`getFocusedElement` 在 **2ms** 内完成（快 160 倍），`getUiElements` 使用批量 BFS 算法在 **~100ms** 内返回完整树。图像差异操作使用 **SSE2 SIMD** 实现 13-15 倍吞吐量。原生引擎不可用时，所有功能透明回退到 PowerShell——零配置。
- **🎯 标记集（SoM）视觉回退** — 游戏、RDP 会话和非无障碍 Electron 应用在 UIA 完全不可见时仍返回可点击元素。`screenshot(detail="text")` 自动检测 UIA 稀疏性并激活混合非 CDP 管道：Rust 加速的灰度 + 双线性放大 → Windows OCR → 聚类 → 红色边界框注释带编号徽章（`[1]`、`[2]`…）。返回两个并行表示：用于空间定位的视觉 PNG 和带 `clickAt` 坐标的语义 `elements[]` 列表——无需 CDP。
- **🔁 视觉目标一键确认** — 在 UIA 不可见的目标（Electron、PWA、游戏、自定义画布、RDP 窗口）上，`desktop_act` 可将操作后确认合并到自身响应中：可选的 `roiCapture` 携带*仅变化区域*的 PNG 裁剪加上无租约的下一个可见控件预览。Agent 确认其点击效果并在一次调用中找到下一个目标，无需单独的 `desktop_state` + `screenshot`。在视觉目标上默认对可见变更开启（`returnCapture:"on-change"`）；传 `returnCapture:"never"` 抑制，`"always"` 强制。结构化目标（浏览器/CDP、UIA 丰富的原生应用）从不附加——这些响应保持不变。
- **LLM 原生设计** — 围绕 LLM 的思维方式而非人类点击方式构建。`run_macro` 将多个操作批量合并为一次 API 调用；`diffMode` 仅发送自上一帧以来变化的窗口。最小令牌，最小往返。
- **响应式感知图** — 为窗口或浏览器标签注册 `lensId`，传递给操作工具，并在每次操作后获得守护检查的 `post.perception` 反馈。减少重复的 `screenshot` / `desktop_state` 调用，防止错误窗口输入或过期坐标点击。
- **完整 CJK 支持** — 使用 Win32 `GetWindowTextW` 获取窗口标题，避免 nut-js 乱码。支持日语/中文/韩语环境的 IME 旁路输入。
- **三层令牌缩减** — `detail="image"`（~443 tok）/ `detail="text"`（~100-300 tok）/ `diffMode=true`（~160 tok）。仅在需要时发送像素。
- **1:1 坐标模式** — `dotByDot=true` 以原生分辨率捕获（WebP）。图像像素 = 屏幕坐标——无需缩放计算。将 `origin`+`scale` 传入 `mouse_click`，服务器自动转换坐标——消除偏移和缩放 bug。
- **浏览器捕获数据缩减** — `grayscale=true`（约 50% 大小）、`dotByDotMaxDimension=1280`（自动缩放并保留坐标）和 `windowTitle + region` 子裁剪有助于排除浏览器边框和其他无关像素。重型捕获的典型缩减：50-70%。
- **Chromium 智能回退** — Chrome/Edge/Brave 上的 `detail="text"` 自动跳过 UIA（在那里极慢）并运行 Windows OCR。`hints.chromiumGuard` + `hints.ocrFallbackFired` 标志所走路径。
- **UIA 元素提取** — `detail="text"` 以 JSON 返回按钮名称和 `clickAt` 坐标。Claude 无需查看屏幕截图即可点击正确元素。
- **自动停靠 CLI** — `window_dock(action='dock')` 将任何窗口吸附到屏幕角落并置顶。设置 `DESKTOP_TOUCH_DOCK_TITLE='@parent'` 在 MCP 启动时自动停靠托管 Claude 的终端——进程树遍历器无论标题如何都能找到正确的窗口。
- **紧急停止（Failsafe）** — 将鼠标移至**屏幕左上角（0,0 的 10px 内）**可立即终止 MCP 服务器。

---

## 系统要求

| | |
|---|---|
| 操作系统 | Windows 10 / 11（64 位）|
| Node.js | 推荐 v20+（已在 v22+ 上测试）|
| PowerShell | 5.1+（Windows 自带）——仅在 Rust 原生引擎不可用时作为回退使用 |
| Claude CLI | 必须有 `claude` 命令可用 |

> **注意：** nut-js 原生绑定需要 Visual C++ Redistributable。
> 如未安装，请从 [Microsoft](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) 下载。

---

## 安装

```bash
npx -y @harusame64/desktop-touch-mcp
```

npm 启动器严格按 npm 包版本解析运行时。对于包 `X.Y.Z`，仅获取 GitHub Release 标签 `vX.Y.Z`，下载 `desktop-touch-mcp-windows.zip`，验证 SHA256 摘要后解压至 `%USERPROFILE%\.desktop-touch-mcp`。已验证的缓存版本在后续运行中复用。

设置 `DESKTOP_TOUCH_MCP_HOME` 可覆盖缓存根目录。

> **在共享或 CI 网络上？** 首次运行会读取 GitHub Releases API 来定位运行时 zip。匿名限制为每 IP 每小时 60 次请求，共享公网地址（CI 运行器、办公 NAT）可能在你开始下载前就耗尽配额。在环境中设置 `GITHUB_TOKEN`（或 `GH_TOKEN`），启动器会认证请求，将限额提升至 5,000 次/小时。普通家用网络无需 Token。

> **从源码检出运行启动器？** 源码构建的 `bin/launcher.js` 携带占位完整性哈希（`sha256: "PENDING"`）而非最终哈希。启动器拒绝下载并运行未验证的运行时——此防护阻止意外发布或未完成的启动器静默启动未验证代码。已发布的 npm 版本始终附带真实 SHA256，终端用户不会遇到此问题。如果刻意从源码运行启动器，设置 `DESKTOP_TOUCH_MCP_ALLOW_UNVERIFIED=1` 跳过完整性验证（仅限开发）。

### 注册到 Claude CLI

在 `~/.claude.json` 的 `mcpServers` 下添加：

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

**无需系统提示词。** 命令参考会通过 MCP `initialize` 响应的 `instructions` 字段自动注入到 Claude 中。

### 注册到其他客户端（HTTP 模式）

需要 HTTP 端点的客户端（GPT Desktop、VS Code Copilot、Cursor 等）可使用内置的 Streamable HTTP 传输：

```bash
npx -y @harusame64/desktop-touch-mcp --http
# 或指定自定义端口：
npx -y @harusame64/desktop-touch-mcp --http --port 8080
# 或指定自定义绑定地址（默认 0.0.0.0 支持远程访问）：
npx -y @harusame64/desktop-touch-mcp --http --host 0.0.0.0 --port 8080
```

服务器默认在 `http://0.0.0.0:23847/mcp` 启动（可从所有网络接口访问）。在 MCP 客户端设置中注册此 URL。健康检查端点为 `http://0.0.0.0:<port>/health`。

#### API 密钥认证

将服务器暴露到网络时，**强烈建议**启用 API 密钥认证以防止未授权访问：

```bash
# 通过命令行参数指定密钥：
npx -y @harusame64/desktop-touch-mcp --http --api-key your-secret-key

# 或通过环境变量指定：
MCP_API_KEY=your-secret-key npx -y @harusame64/desktop-touch-mcp --http
```

客户端必须通过以下方式之一在请求中包含 API 密钥：
- **HTTP 请求头**：`X-API-Key: your-secret-key`
- **URL 查询参数**：`?api_key=your-secret-key`

未提供正确密钥的请求将收到 `401 Unauthorized` 响应。

在 HTTP 模式下，系统托盘图标会显示活动 URL 并提供快速复制和在浏览器中打开的快捷方式。

### 开发安装

```bash
git clone https://github.com/wangkang1133/desktop-touch-mcp.git
cd desktop-touch-mcp
npm install
```

安装后构建：

```bash
npm run build
```

对于本地检出，直接注册构建好的服务器：

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

> **注意：** 将 `D:/path/to/desktop-touch-mcp` 替换为你克隆此仓库的实际路径。

---

## 工具（31 个优化工具）

> 📖 **完整参考**：[`docs/system-overview.md`](docs/system-overview.md) — 关于参数、返回模式和坐标数学的详尽指南。

### 🌐 World-Graph V2（主路径）
| 工具 | 说明 |
|---|---|
| `desktop_discover` | 观察桌面。返回带有租约的可交互实体（UIA、CDP、终端、视觉 SoM）。|
| `desktop_act` | 通过租约验证对实体执行操作（点击、输入、拖拽、选择）。返回语义差异——在视觉目标上可选附加 `roiCapture`（变化区域 PNG + 下一个目标预览）。|

### 👁️ 观察与状态
| 工具 | 说明 |
|---|---|
| `desktop_state` | 轻量级检查：焦点、活动窗口、光标和自动感知注意力信号。|
| `screenshot` | 多模式捕获：`detail='text'`（UIA/OCR）、`diffMode`（P 帧）、`dotByDot`（1:1）和 `background`。返回轻量的 `screenshot://by-ref/{id}` 链接指向已保存图像，而非每次内联像素。|
| `screenshot_query` / `screenshot_gc` | 检查和清理磁盘上的屏幕截图缓存：`screenshot_query` 不重新读取像素即可列出已保存捕获；`screenshot_gc` 按保留策略回收空间（默认试运行）。|
| `workspace_snapshot` | 即时会话概览：一次调用获取所有窗口缩略图 + UI 摘要。|
| `server_status` | 诊断检查原生引擎健康状态和功能激活。|

### ⌨️ 输入与控制
| 工具 | 说明 |
|---|---|
| `keyboard` | 发送键盘输入。支持后台输入（WM_CHAR）和 IME 安全的剪贴板旁路。|
| `mouse_click` / `mouse_drag` | 精确坐标交互，带寻的和强制焦点保护。|
| `scroll` | 多策略：`raw`（滚轮）、`to_element`、`smart`（虚拟列表）和 `capture`（拼接）。|
| `click_element` | 传统 UIA 按名称/ID 点击（实体不可用时的回退）。|

### 🌐 浏览器 CDP（Chrome/Edge/Brave）
| 工具 | 说明 |
|---|---|
| `browser_open` / `browser_navigate` | 幂等的调试模式启动和可靠导航。|
| `browser_click` / `browser_fill` / `browser_form` | 高层 DOM 交互，跨重绘和框架重渲染稳定。|
| `browser_eval` | 通过 `js`（脚本）、`dom`（HTML）和 `appState`（SPA 数据提取）深度检查。|
| `browser_overview` / `browser_search` / `browser_locate` | 语义发现、类 grep DOM 搜索和像素精确坐标查找。|

### 🛠️ 工具与工作流
| 工具 | 说明 |
|---|---|
| `terminal` | 统一命令执行：`run`（发送 + 等待 + 读取）、`read`（OCR/UIA）和 `send`。`run` 完成模式：`quiet`、`pattern` 和 `exit`（等待命令完成 + 返回退出码——参见[终端命令完成](#终端命令完成until)）。|
| `wait_until` | 高效的服务端轮询，等待窗口、焦点、文本或 URL 状态变化。|
| `window_dock` / `focus_window` | 窗口管理：`pin`（置顶）、`unpin`、`dock`（角落吸附）和 `focus`。|
| `workspace_launch` | 启动应用并自动检测新 HWND（支持本地化标题）。|
| `run_macro` | 批量最多 50 个操作为单次往返，实现最大效率。|
| `clipboard` / `notification_show` | 系统级文本交换和用户提醒。|

### 📊 办公（Excel）
| 工具 | 说明 |
|---|---|
| `excel` | 通过 COM 编写和运行 Excel VBA 宏。`action='run_vba'` 将宏写入受信任位置并运行；`action='check_access_vbom'` 是只读预检。运行仅公式工具无法实现的 VBA。一次性设置：`node scripts/enable-access-vbom.mjs`。|

---

## 标准工作流（v1.0.0）

V2 World-Graph 界面（`desktop_discover` / `desktop_act`）是推荐的调度路径。四步调用模式对原生应用、浏览器和终端完全一致。

```
desktop_state          → 定位：焦点窗口/元素、模态框、注意力信号
desktop_discover       → 发现可操作实体（返回租约 + windows[]）
desktop_act(lease, …)  → 对实体操作（返回 attention + post.perception）
desktop_state          → 确认世界按预期变化
```

点击——优先级顺序：

```
browser_click(selector)               → Chrome / Edge（CDP，跨重绘稳定）
desktop_act(lease, action='click')    → 原生 / 对话框 / 视觉（基于实体；在 desktop_discover 后使用）
click_element(name | automationId)    → 原生 UIA 回退，当 desktop_act 返回 ok:false
mouse_click(x, y, origin?, scale?)    → 像素最后手段；仅用于 dotByDot 屏幕截图的 origin+scale
```

恢复提示——每次观察后阅读 `response.attention`，在 `desktop_discover` / `desktop_act` 上阅读 `response.warnings[]`。常见原因：

- `lease_expired` / `lease_generation_mismatch` / `lease_digest_mismatch` / `entity_not_found` → 重新调用 `desktop_discover`
- `modal_blocking` → `response.blockingElement`（存在时）命名阻塞模态框；通过 `click_element(name=blockingElement.name)` 关闭后重试
- `entity_outside_viewport` → `scroll(action='to_element' | 'raw')`，然后重新调用 `desktop_discover`
- `executor_failed` → 回退到 `click_element` / `mouse_click` / `browser_click`

租约生命周期：

- 每次 `desktop_discover` 响应携带 `softExpiresAtMs`（约为 TTL 窗口的 60%）。超过该时间戳后 LLM 应考虑重新调用 `desktop_discover`，即使租约在技术上仍然有效——`lease.expiresAtMs` 是唯一正确性边界。
- TTL 适应 `view` 模式（`action`/`explore`/`debug`）、实体数量和响应有效载荷大小。上限 60 秒。
- 设置 `DESKTOP_TOUCH_DISABLE_FUKUWARAI_V2=1` 回退到 v1 工具界面（`get_windows` / `get_ui_elements` / `set_element_value`）——仅用于故障排查，V2 是推荐默认。

---

## 终端命令完成（`until`）

`terminal(action='run')` 在一次调用中发送命令、等待完成并读取输出。如何判定"完成"由 `until` 控制：

| 模式 | 等待条件 | 最佳用途 |
|---|---|---|
| `quiet`（默认）| 输出静止 `quietMs` 毫秒 | 短的交互式命令 |
| `pattern` | 期望在输出中出现的字符串/正则 | 有已知最终标记的长命令 |
| `exit` | 命令实际**完成** | 需要完成状态或退出码时 |

> **锚定注意事项（#384）：** 最终行没有尾随换行的命令会将标记粘到下一个提示符而没有行边界（`printf X` → `Xuser@host:~$`），因此末尾锚定的 `pattern`（`X\s*\n` / `X$`）永远无法匹配。对于*完成*使用 `mode:'exit'`；对于*内容*匹配使用裸标记（不带 `\n`/`$`）。`mode:'pattern'` 也接受可选的 `quietMs` 稳定回退：`until:{mode:'pattern', pattern, quietMs:1000}` 在输出稳定这么长时间后以 `reason:'quiet'` 完成（无 `matchedPattern`）——而不是挂起等到 `timeoutMs`。这是可选的（省略 `quietMs` 则一直等待模式匹配；有中间静默间隔的长命令不受影响）。

### `until:{mode:'exit'}` — 真正的完成 + 退出码

启发式模式可能在常见的"追加哨兵"惯用法上误判（`some-task; echo DONE` 被 `DONE` 匹配）：哨兵也出现在**回显的命令行**中，对于多行命令没有可靠方法区分回显和真实输出。`mode:'exit'` 消除了猜测——服务器追加自己的完成标记，其*打印*形式不同于*输入*形式，因此永远不会匹配回显命令（即使多行输入），并返回真实的进程退出码：

```js
terminal({
  action: 'run',
  windowTitle: 'pwsh',
  input: 'npm run build',
  until: { mode: 'exit', shell: 'powershell' },
})
// → completion: { reason: 'exited', exitCode: 0, elapsedMs: … }
//   output: 仅命令的真实输出（注入的标记已被剥离）
```

- **显式传递 `shell`**（`'bash'` 或 `'powershell'`）。`shell:'auto'` 从终端窗口检测 shell，但无法看到在 SSH 或 WSL 内运行的 shell——窗口看起来仍像其本地主机——因此对于远程/嵌套会话传递远端的 shell（`auto` 否则会警告并可能选择外层 shell）。真正无法识别进程的窗口（如 Windows Terminal）返回 `ExitModeShellAmbiguous`。
- **一等 shell：** `bash` 和 `powershell`。`cmd.exe` 尚不支持（`ExitModeShellUnsupported`）。
- **不安全输入被预先拒绝**（`ExitModeUnsafeInput`）而非挂起：以半构造终止的命令（未闭合引号、here-doc、`$(…)`、尾随 `\` 或 PowerShell 反引号）。
- 退出模式控制自身的传递，因此塑造传递的 `sendOptions`（`method` / `preferClipboard` / `pressEnter` / `chunkSize` / `pasteKey`）被以 `InvalidArgs` 拒绝；焦点选项仍然可用。

---

## 浏览器 CDP 自动化

对于 Web 自动化，连接启用远程调试端口的 Chrome 或 Edge——无需 Selenium 或 Playwright。

```bash
# 以 CDP 模式启动 Chrome
chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\tmp\cdp
```

```
browser_open({launch:{}})                          → 按需启动调试模式 Chrome + 列出标签页（幂等）
browser_open()                                     → 仅连接（无 CDP 端点时失败）
browser_locate({selector:"#submit"})               → CSS 选择器 → 物理屏幕坐标
browser_click({selector:"#submit"})                → 一键找到 + 点击（自动聚焦浏览器）
browser_eval({action:"js", expression:"document.title"})  → 执行 JS，返回结果
browser_eval({action:"dom", selector:"#main", maxLength:5000})  → outerHTML，截断至 maxLength 字符
browser_eval({action:"appState"})                  → 一次性 SPA 状态（Next/Nuxt/Remix/Apollo/GitHub react-app/Redux SSR）
browser_fill({selector:"#email", value:"user@example.com"})  → 填充 React/Vue/Svelte 受控输入（状态安全）
browser_overview()                                 → 链接/按钮/输入 + ARIA 切换 + 每个元素的 viewportPosition
browser_search({by:"text", pattern:"..."})         → 带置信度排名的 DOM grep
browser_navigate({url:"https://example.com"})      → 通过 CDP 导航（无地址栏交互）
```

在同一标签页中链式调用时，传 `includeContext:false` 省略 activeTab/readyState 注释（每次调用约节省 150 token）。布尔/对象参数接受 LLM 友好的字符串拼法（`"true"`、`"{}"`）。

`browser_locate` 返回的坐标已考虑浏览器边框（标签栏 + 地址栏高度）和 `devicePixelRatio`，因此可直接传给 `mouse_click`，无需任何缩放。

**推荐的 Web 工作流：**
```
browser_open({launch:{}}) → browser_eval({action:"dom"}) → browser_locate(selector) → browser_click(selector)
```

---

## 启动时自动停靠 CLI

全屏操作其他应用时保持 Claude CLI 可见。在 MCP 配置中设置环境变量，停靠窗口在每次 MCP 启动时自动吸附到位。

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

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `DESKTOP_TOUCH_DOCK_TITLE` | *（未设置 = 关闭）* | `@parent` 遍历 MCP 进程树找到托管终端——免疫标题/分支/项目变化。或使用字面子串。|
| `DESKTOP_TOUCH_DOCK_CORNER` | `bottom-right` | `top-left` / `top-right` / `bottom-left` / `bottom-right` |
| `DESKTOP_TOUCH_DOCK_WIDTH` / `HEIGHT` | `480` / `360` | 像素（`"480"`）或工作区比例（`"25%"`）——4K/8K 自动适配 |
| `DESKTOP_TOUCH_DOCK_PIN` | `true` | 置顶切换 |
| `DESKTOP_TOUCH_DOCK_MONITOR` | 主显示器 | 来自 `desktop_state({includeScreen:true})` 的显示器 ID |
| `DESKTOP_TOUCH_DOCK_SCALE_DPI` | `false` | 为真时，将像素值乘以 `dpi / 96`（按显示器缩放可选）|
| `DESKTOP_TOUCH_DOCK_MARGIN` | `8` | 屏幕边缘内边距（像素）|
| `DESKTOP_TOUCH_DOCK_TIMEOUT_MS` | `5000` | 目标窗口出现的最长等待时间 |

> **输入路由注意事项：** 当置顶窗口激活时（如 Claude CLI），`keyboard(action='type')` / `keyboard(action='press')` 会将按键发送到它，**而不是**你要输入的目标应用。在键盘操作前始终先调用 `focus_window(title=...)`，然后通过 `screenshot(detail='meta')` 验证 `isActive=true`。

### 屏幕截图缓存（按引用存储）

`screenshot` 和其他视觉结果返回轻量的 `screenshot://by-ref/{id}` 链接指向磁盘上保存的图像，而非每次内联像素，因此常规的观察-操作-确认循环消耗的令牌大大减少。缓存自动限制自身大小，`screenshot_query` / `screenshot_gc` 让你检查和清理它。通过以下设置调整存储：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `DESKTOP_TOUCH_SCREENSHOTS_DIR` | *（每用户缓存目录）* | 将缓存固定到特定文件夹。如默认文件夹无法创建或写入（如企业策略阻止在用户配置文件下新建文件夹），服务器自动探测此目录 → 运行时目录 → OS 临时文件夹，使用第一个可写的而非直接放弃缓存。|
| `DESKTOP_TOUCH_SCREENSHOT_MAX_COUNT` | `200` | 缓存中最多保留此数量的捕获。|
| `DESKTOP_TOUCH_SCREENSHOT_MAX_BYTES` | `256 MiB` | 磁盘上缓存总大小上限。|
| `DESKTOP_TOUCH_SCREENSHOT_MAX_AGE_MS` | *（关闭）* | 丢弃超过此毫秒数的旧捕获（可选）。|
| `DESKTOP_TOUCH_SCREENSHOT_AUTOPRUNE` | `on` | 自动修剪缓存以容纳新捕获。设 `0` 禁用。|
| `DESKTOP_TOUCH_SCREENSHOT_MIN_EVICT_AGE_MS` | `60000` | 不自动驱逐比此更年轻的捕获（ms），因此刚拿到的 by-ref 链接足够时间打开，即使同一 PC 上有另一个 AI/进程也在捕获。`0` 禁用。|

### 自动感知（始终开启）

Phase 4 将显式 `perception_*` 工具族私有化——v0.12 自动感知层自动在每个 `desktop_state` 和 `desktop_act` 响应上附加 `attention` 信号。操作工具在传入 `windowTitle` 时也会自动守护。不再需要手动注册/读取/遗忘 lens。

```
# desktop_state 始终返回注意力信号
desktop_state() → {focusedWindow, focusedElement, modal, attention:"ok", ...}

# 操作工具在传入 windowTitle 时自动守护：
keyboard({action:"type", text:"hello", windowTitle:"Notepad"})
→ post.perception:{status:"ok"}  // 守护失败时阻止不安全输入

# 当注意力为 dirty / stale / settling 时，用 desktop_state 刷新：
desktop_state()  // 通过自动感知重新评估注意力
```

对于高级固定目标工作流，`lensId` 参数仍然可在操作工具上使用（`keyboard`、`mouse_click`、`mouse_drag`、`click_element`、`browser_click`、`browser_navigate`、`browser_eval`、`desktop_act`）。省略 `lensId` 即走正常自动感知路径。底层注册表、热目标缓存和传感器循环不变；仅退役了显式的 `perception_register / perception_read / perception_forget / perception_list` 工具。

---

## 鼠标寻的校正

当 Claude 调用 `screenshot(detail='text')` 读取坐标，几秒后调用 `mouse_click` 时，目标窗口可能已移动。寻的系统自动校正此偏移。

| 层级 | 启用方式 | 延迟 | 作用 |
|------|---------|------|------|
| 1 | 自动启用（如缓存存在）| <1ms | 窗口移动时应用 (dx, dy) 偏移 |
| 2 | 传 `windowTitle` 提示 | ~100ms | 窗口被遮挡时自动提前 |
| 3 | 传 `elementName`/`elementId` + `windowTitle` | 1–3s | 窗口大小变化时重新查询 UIA 获取新坐标 |

```
# 仅层级 1（自动）
mouse_click(x=500, y=300)

# 层级 1 + 2：如窗口被隐藏则同时提前
mouse_click(x=500, y=300, windowTitle="Notepad")

# 层级 1 + 2 + 3：窗口大小变化时也重新查询 UIA
mouse_click(x=500, y=300, windowTitle="Notepad", elementName="Save")

# 关闭寻的控制——不校正
mouse_click(x=500, y=300, homing=false)
```

`homing` 参数在 `mouse_click`、`mouse_drag` 和 `scroll` 上可用。缓存在每次 `screenshot()`、`desktop_discover()`、`focus_window()` 和 `workspace_snapshot()` 调用时自动更新。

### `mouse_click` 图像局部坐标（origin + scale）

使用 `dotByDotMaxDimension` 拍摄 `dotByDot` 屏幕截图时，响应会打印 `origin` 和 `scale` 值。无需手动计算屏幕坐标，直接复制到 `mouse_click` 中：

```
# 屏幕截图响应：
#   origin: (0, 120) | scale: 0.6667
#   点击图像像素 (ix, iy)：mouse_click(x=ix, y=iy, origin={x:0, y:120}, scale=0.6667)

mouse_click(x=640, y=300, origin={x:0, y:120}, scale=0.6667, windowTitle="Chrome")
# 服务器转换：screen = (0 + 640/0.6667, 120 + 300/0.6667) = (960, 570)
```

这消除了整类偏移和缩放 bug。不传 origin/scale 时，`x`/`y` 仍为绝对屏幕像素（行为不变）。

---

## `screenshot` 关键参数

```
detail="image"          — PNG/WebP 像素（默认）
detail="text"           — UIA 元素 JSON + clickAt 坐标（无图像，~100-300 tok）
detail="meta"           — 仅标题 + 区域（最省，~20 tok/窗口）
dotByDot=true           — 1:1 WebP；image_px + origin = screen_px
dotByDotMaxDimension=N  — 限制最长边（响应包含用于坐标计算的 scale）
grayscale=true          — 文本密集型捕获约缩小 50%（代码/AWS 控制台）
region={x,y,w,h}        — 带 windowTitle：窗口局部坐标（排除浏览器边框）
                          不带：虚拟屏幕坐标
diffMode=true           — 首次调用 I 帧，之后 P 帧（仅变化窗口）（~160 tok）
ocrFallback="auto"      — detail='text' 在 uiaSparse 或为空时自动触发 Windows OCR
```

**推荐的 Chrome 组合**（减少 50-70% 数据）：
```
screenshot(windowTitle="Chrome",
           dotByDot=true, dotByDotMaxDimension=1280, grayscale=true,
           region={x:0, y:120, width:1920, height:900})  # 跳过浏览器边框
```

**推荐工作流：**
```
workspace_snapshot()                     → 完整概览（重置差异缓冲区）
screenshot(detail="text", windowTitle=X) → 获取 actionable[].clickAt 坐标
mouse_click(x, y)                        → 直接点击，无需计算
screenshot(diffMode=true)                → 仅检查变化（~160 tok）
```

---

## 安全

### 紧急停止（Failsafe）

**将鼠标移至屏幕左上角（0,0 的 10px 内）可立即终止 MCP 服务器。**

- **每次工具检查**：`checkFailsafe()` 在每个工具处理器前运行
- **后台监控**：500ms 轮询作为长时间操作的备份
- 触发范围：10px

### API 密钥认证（本 Fork 新增）

当通过 HTTP 模式将服务器暴露到网络时，启用 API 密钥认证可防止未授权访问。

- **启用方式**：启动参数 `--api-key <密钥>` 或环境变量 `MCP_API_KEY`
- **客户端传递**：请求头 `X-API-Key` 或查询参数 `?api_key=`
- **认证失败**：返回 `401 Unauthorized`

### 被阻止的操作

**`workspace_launch` 黑名单：**
`cmd.exe`、`powershell.exe`、`pwsh.exe`、`wscript.exe`、`cscript.exe`、`mshta.exe`、`regsvr32.exe`、`rundll32.exe`、`msiexec.exe`、`bash.exe`、`wsl.exe` 被阻止。
脚本扩展名（`.bat`、`.ps1`、`.vbs` 等）被拒绝。包含 `;`、`&`、`|`、`` ` ``、`$(`、`${` 的参数也被拒绝。

**`keyboard(action='press')` 黑名单：**
`Win+R`（运行对话框）、`Win+X`（管理员菜单）、`Win+S`（搜索）、`Win+L`（锁屏）被阻止。

### PowerShell 注入防护

UIA 桥接 PowerShell 回退路径中的所有 `-like` 模式都通过 `escapeLike()` 进行清理，在到达 PowerShell 前转义通配符字符（`*`、`?`、`[`、`]`）。当 Rust 原生引擎激活时，UIA 操作不调用 PowerShell。

### `workspace_launch` 白名单

Shell 解释器默认被阻止。要允许特定可执行文件，创建白名单文件：

**文件位置（按顺序搜索）：**
1. `DESKTOP_TOUCH_ALLOWLIST` 环境变量中的路径
2. `~/.claude/desktop-touch-allowlist.json`
3. 服务器工作目录中的 `desktop-touch-allowlist.json`

**格式：**
```json
{
  "allowedExecutables": [
    "pwsh.exe",
    "C:\\Tools\\myapp.exe"
  ]
}
```

更改立即生效——无需重启。

---

## 鼠标移动速度

所有鼠标工具（`mouse_click`、`mouse_drag`、`scroll`）接受可选的 `speed` 参数：

| 值 | 行为 |
|---|---|
| 省略 | 使用配置的默认值（见下）|
| `0` | 瞬移——`setPosition()`，无动画 |
| `1–N` | 以 N 像素/秒动画移动 |

**默认速度**为 1500 像素/秒。通过 `DESKTOP_TOUCH_MOUSE_SPEED` 环境变量永久更改：

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

常用值：`0` = 瞬移，`1500` = 默认温和，`3000` = 快速，`5000` = 非常快。

---

## 强制焦点（AttachThreadInput）

Windows 前台窗口窃取保护可能阻止 `SetForegroundWindow` 在另一个窗口（如置顶的 Claude CLI）位于前台时成功。这会导致后续按键或点击落在错误窗口中——一种静默失败。

`mouse_click`、`keyboard(action='type')`、`keyboard(action='press')` 和 `terminal(action='send')` 都接受 `forceFocus` 参数，使用 `AttachThreadInput` 绕过此保护：

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

如果即使 `AttachThreadInput` 也被拒绝强制尝试，响应为 `ok:false`，`code: "ForegroundRestricted"`（issue #202 统一——与 `focus_window`、`keyboard`、`terminal_send`、`mouse_click` 相同形状）。操作本身**被抑制**，因此按键/点击永远不会落在错误窗口上。通过 `focus_window` 的自动升级阶梯恢复后重试。不再发出旧版 `hints.warnings: ["ForceFocusRefused"]` 形状。

**通过环境变量全局默认：**

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

设置 `DESKTOP_TOUCH_FORCE_FOCUS=1` 使 `forceFocus: true` 成为四个工具的默认值，无需更改每次调用。

**已知权衡：**

- 在约 10ms 的 `AttachThreadInput` 窗口期间，键状态和鼠标捕获在两个线程间共享。在快速宏序列中可能导致竞态条件（实践中罕见）。
- 当用户手动操作另一个应用时，禁用 `forceFocus`（或取消设置环境变量）以避免意外焦点转移。

---

## 自动守护

操作工具（`mouse_click`、`mouse_drag`、`keyboard(action='type'/'press')`、`click_element`、`desktop_act`、`browser_click`、`browser_navigate`）在传入 `windowTitle` / `tabId` 时自动为每次操作守护：

- 验证目标窗口身份（检测进程重启 / HWND 替换）
- 确认点击坐标在目标窗口矩形内
- 在每个响应上返回 `post.perception.status`——包括失败——以便 LLM 无需截图即可恢复

**禁用自动守护** — 设置 `DESKTOP_TOUCH_AUTO_GUARD=0` 恢复 v0.11.12 行为（无自动守护）：

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

自动守护启用时（默认），`post.perception.status` 将为以下之一：

| 状态 | 含义 |
|---|---|
| `ok` | 守护通过——目标验证成功 |
| `unguarded` | 未提供 `windowTitle`；操作未守护执行 |
| `target_not_found` | 没有窗口匹配给定标题 |
| `ambiguous_target` | 多个窗口匹配；使用更具体的标题 |
| `identity_changed` | 窗口被替换（进程重启 / HWND 变化）|
| `unsafe_coordinates` | 点击坐标在目标窗口矩形外 |
| `needs_escalation` | 使用 `browser_click` 或指定 `windowTitle` |

返回 `unsafe_coordinates` 或 `identity_changed` 时，响应可能包含 `suggestedFix.fixId`。将 `fixId` 传给相关工具调用以批准恢复：

```json
{ "name": "mouse_click",           "arguments": { "fixId": "fix-..." } }
{ "name": "keyboard(action='type')",         "arguments": { "fixId": "fix-...", "text": "hello" } }
{ "name": "click_element",         "arguments": { "fixId": "fix-..." } }
{ "name": "browser_click", "arguments": { "fixId": "fix-..." } }
```

修复是一次性的，15 秒后过期。服务器在执行前重新验证目标进程身份。

---

## 高级响应选项

### browser_eval 结构化模式

传 `withPerception: true` 接收带 `post.perception` 的结构化 JSON 响应而非原始文本：

```json
{ "name": "browser_eval", "arguments": { "expression": "document.title", "withPerception": true } }
```

返回 `{ ok: true, result: "...", post: { perception: { status: "ok", ... } } }`。

### mouse_drag 跨窗口守护

`mouse_drag` 现在守护起始和结束坐标。跨越窗口边界（或到达桌面壁纸）的拖拽默认被阻止。要允许有意的跨窗口或范围选择拖拽：

```json
{ "name": "mouse_drag", "arguments": { "startX": 100, "startY": 100, "endX": 900, "endY": 900, "allowCrossWindowDrag": true } }
```

---

## 性能（v0.15 — Rust 原生引擎）

Rust 原生引擎（`@harusame64/desktop-touch-engine`）用持久 MTA 线程上的直接 COM 调用替代 PowerShell 进程创建。它作为 `.node` 插件自动加载——无需配置。

### UIA 基准测试（对比 PowerShell 基线）

| 功能 | Rust 原生 | PowerShell | 加速比 |
|---|---|---|---|
| `getFocusedElement` | **2.2 ms** | 366 ms | **163.9×** |
| `getUiElements`（Explorer，~60 元素）| **106.5 ms** | 346 ms | **3.3×** |
| **加权平均** | | | **~82×** |

### 图像差异基准测试（SSE2 SIMD）

| 功能 | Rust (SSE2) | TypeScript | 加速比 |
|---|---|---|---|
| `computeChangeFraction`（1920×1080）| **0.26 ms** | 3.8 ms | **~15×** |
| `dHash`（感知哈希）| **0.09 ms** | 1.2 ms | **~13×** |

### 架构

```
Claude CLI / MCP 客户端
    │  stdio 或 HTTP（MCP 协议）
    ▼
desktop-touch-mcp（TypeScript）
    │
    ├── Rust 原生引擎（.node 插件）          ← v0.15 新增
    │   ├── UIA：通过 napi-rs + windows-rs 0.62 的 13 个函数
    │   │   └── 专用 COM 线程（MTA）+ 批量 BFS 算法
    │   └── 图像：SSE2 SIMD 像素差异 + 感知哈希
    │
    └── PowerShell 回退（自动）
        └── .node 不可用时透明激活
```

### 为什么 `getUiElements` 是 3.3 倍（而非 160 倍）

`getFocusedElement` 上 160 倍加速来自消除 PowerShell 进程启动（~200 ms）和 .NET 程序集加载。对于 `getUiElements`，瓶颈转移到目标应用（如 Explorer）内部的 **UIA 提供者**——无论谁查询，它必须枚举其 UI 树。Rust 引擎使用 **批量 BFS 算法**（`FindAllBuildCache` + `TreeScope_Children`），最大限度减少跨进程 RPC 调用并支持 `maxElements` 提前退出，在大型树（VS Code、具有 1000+ 元素的浏览器）上显著更快。

---

## UI 操作层（V2）

> **状态：v0.17 起默认开启。** `desktop_discover` 和 `desktop_act` 开箱即用。

V2 引入两个新工具，用基于实体的交互替代基于坐标的点击：

| 工具 | 说明 |
|---|---|
| `desktop_discover` | 观察窗口或浏览器标签页。返回带租约的可交互实体——无原始屏幕坐标。支持 UIA（原生）、CDP（浏览器）、终端和视觉 GPU 通道。|
| `desktop_act` | 与 `desktop_discover` 返回的实体交互。执行前验证租约。返回语义差异（`entity_disappeared`、`modal_appeared`、`focus_shifted`…）。在视觉目标上，成功操作可捆绑 `roiCapture`（变化区域 PNG 裁剪 + 无租约的下一个目标预览），因此一次调用即可确认结果并找到下一个目标——由 `returnCapture` 控制（`on-change`——可见变更时默认；`never` 抑制；`always` 强制）。|

### 点击——优先级顺序

当多个工具可执行相同点击时，按此顺序优先使用：

1. `browser_click(selector)` — Chrome / Edge 通过 CDP（跨重绘稳定）
2. `desktop_act(lease)` — 原生窗口、对话框、视觉目标（基于实体；在 `desktop_discover` 后使用）
3. `click_element(name | automationId)` — `desktop_act` 返回 `ok:false` 时的原生 UIA 回退
4. `mouse_click(x, y)` — 像素级最后手段（仅用于 `dotByDot` 屏幕截图的 `origin` + `scale`）

### 禁用 V2（终止开关）

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

所有 V1 工具继续正常工作——无需重新安装。删除环境变量条目并重启即可重新启用。

标志语义（精确匹配：仅字面字符串 `"1"` 有效）：

| `DISABLE_FUKUWARAI_V2` | V2 状态 |
|---|---|
| 未设置 / 非 `"1"` | **开启**（默认）|
| `"1"` | **关闭**（终止开关）|

### 已移除：`DESKTOP_TOUCH_ENABLE_FUKUWARAI_V2`

这是 v0.16.x 中的选择加入开关。V2 自 v0.17 起默认开启，此标志不再有效，可从配置中安全删除。要关闭 V2，设置 `DESKTOP_TOUCH_DISABLE_FUKUWARAI_V2=1`。

### V2 失败时的恢复

如果 `desktop_act` 返回 `ok: false`，阅读 `reason` 并遵循工具描述中的内置恢复提示。常见路径：

- `lease_expired` / `*_mismatch` / `entity_not_found` → 重新调用 `desktop_discover`
- `modal_blocking` → `response.blockingElement`（存在时）携带 `{ name, role, automationId? }`；用 `click_element(name=blockingElement.name)` 关闭后重试
- `entity_outside_viewport` → `scroll` / `scroll(action='to_element')`，然后重新调用 `desktop_discover`
- `executor_failed` → 回退到 `click_element` / `mouse_click` / `browser_click`

对于 `desktop_discover` 警告（`visual_provider_unavailable`、`visual_provider_warming`、`cdp_provider_failed`…），基于坐标的工具（`screenshot(detail='text')`、`click_element`、`mouse_click`、`terminal`…）仍作为逃生通道可用。

---

## 已知限制

| 限制 | 详情 | 变通方案 |
|---|---|---|
| 游戏/视频播放器在 PrintWindow 捕获中可能返回黑屏或挂起 | DirectX 全屏应用可能不在 `PW_RENDERFULLCONTENT` 下重绘。窗口目标的 `screenshot(detail='image')` 已在 PrintWindow 返回无数据或全黑+零方差帧时自动回退到 BitBlt，但挂起调用的 DirectX 表面不会触发回退。| 用 `screenshot({mode:'background', fullContent:false})` 重试以切换到旧版 PrintWindow 标志；如果仍为黑屏，BitBlt 回退路径（默认 `mode='normal'`）至少返回屏幕上的矩形——`hints.captureFallbackReason` 会说 `printwindow-all-black` |
| UIA 调用开销 | Rust 原生引擎约 2ms（焦点）/ ~100ms（树）；PowerShell 回退约 300ms | Rust 引擎自动加载；`workspace_snapshot` 内部使用 2 秒超时 |
| Chrome / WinUI3 UIA 元素为空 | Chromium 仅暴露有限的 UIA | `screenshot(detail='text')` 自动检测 Chromium 并回退到 Windows OCR（`hints.chromiumGuard=true`）。 richer DOM 访问使用 `browser_open` + `browser_locate` |
| Chromium 标题正则匹配在站点重写 `document.title` 时不命中 | 守护依赖 ` - Google Chrome` 后缀存在；某些站点将其推出长标题末尾 | 标题被视为普通 Chrome（运行 UIA）。OCR 路径仍可通过 `ocrFallback='always'` 或 UIA 返回 `<5` 元素时（`uiaSparse`）到达 |
| `browser_*` CDP 工具需要以 `--remote-debugging-port` 启动 Chrome | 如果 Chrome 已在默认配置文件上运行而未带此标志，`browser_open` 失败 | 先关闭 Chrome，然后 `browser_open({launch:{}})` 会以调试模式重新启动，或手动以 `--remote-debugging-port=9222 --user-data-dir=C:\tmp\cdp` 启动 |
| 层缓冲区 TTL | 缓冲区在 90 秒不活动后自动清除 → 下一次 `diffMode` 变为 I 帧 | 长时间等待后，调用 `workspace_snapshot` 显式重置缓冲区 |
| `keyboard(action='type')` / `keyboard(action='press')` 跟随焦点 | 当 `window_dock(action='dock')(pin=true)` 保持另一个窗口置顶（如 Claude CLI）时，按键可能被该窗口吸收 | 先调用 `focus_window(title=...)` 并在发送按键前通过 `screenshot(detail='meta')` 验证 `isActive=true` |
| Chrome/Edge 中 `keyboard(action='type')` 的破折号/智能引号 | 非 ASCII 标点（破折号 `—`、连字符 `–`、智能引号 `"" ''`）可能被截获为键盘快捷键，将焦点移至地址栏 | 当文本包含此类字符时始终使用 `use_clipboard=true` |
| React / Vue / Svelte 输入上的 `browser_eval(action='js')` | 直接设置 `element.value = ...` 或派发合成事件不会更新框架的内部状态 | 使用 `browser_fill(selector, value)` — 它使用原生原型 setter + InputEvent，确实更新 React/Vue/Svelte 状态 |

---

## Token 成本参考

| 模式 | Token 数 | 用途 |
|---|---|---|
| `screenshot`（768px PNG）| ~443 tok | 通用视觉检查 |
| `screenshot(dotByDot=true)` 窗口 | ~800 tok | 精确点击（无需坐标计算）|
| `screenshot(diffMode=true)` | ~160 tok | 操作后差异 |
| `screenshot(detail="text")` | ~100–300 tok | UI 交互（无图像）|
| `workspace_snapshot` | ~2000 tok | 完整会话概览 |

---

## 🚀 3,000+ 下载！

本项目刚超过 **3,000+ 下载**。衷心感谢每位尝试实验性桌面自动化 MCP 服务器、提交 issue、发起 PR 和分享问题的人。每个 bug 报告都让下一个版本更好。感谢你与我一起构建！

---

## 许可证

MIT
