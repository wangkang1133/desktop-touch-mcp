# desktop-touch-mcp

[![MCP server](https://glama.ai/mcp/servers/Harusame64/desktop-touch-mcp/badges/card.svg)](https://glama.ai/mcp/servers/Harusame64/desktop-touch-mcp)

> **Windows 10/11 专用 Computer-use MCP 服务器** — 截图、UI Automation、Chrome CDP、键鼠输入、终端，31 个工具，原生 Rust 引擎 + PowerShell 回退。

---

## 快速开始

```bash
# 方式 A：下载 zip 包（推荐，无需 npm）
# 从 https://github.com/Harusame64/desktop-touch-mcp/releases 下载 zip
# 解压后运行：
node dist/index.js              # stdio 模式
node dist/index.js --http --port 23847 --key YOUR_KEY  # HTTP 模式
start.bat                        # Windows 双击启动

# 方式 B：npx
npx -y @harusame64/desktop-touch-mcp
```

### 注册到 Claude CLI

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

### HTTP 模式（远程/局域网）

```bash
# 仅本机（无需密钥）
node dist/index.js --http --port 23847 --host 127.0.0.1

# 局域网/远程（API 密钥必填）
node dist/index.js --http --port 23847 --host 0.0.0.0 --key YOUR_KEY

# 或通过环境变量
set DESKTOP_TOUCH_API_KEY=YOUR_KEY
node dist/index.js --http --port 23847
```

> 默认绑定 `0.0.0.0`。绑定到非 localhost 地址时 **API 密钥为必填**，客户端须带 `Authorization: Bearer <KEY>` 请求头。健康检查：`http://<地址>:<端口>/health`。

---

## 核心理念

1. **发现-操作** — `desktop_discover` 返回带租约的可交互实体（非原始坐标），`desktop_act` 操作你**意图的目标**而非它**曾经的位置**
2. **感知防护** — 每次操作前自动验证目标窗口身份和边界，防止误窗口输入
3. **Rust 原生加速** — UIA 焦点查询 2ms（160× 加速），图像差分 SSE2 SIMD 13~15× 加速；引擎不可用时透明回退 PowerShell

---

## 环境要求

| 要求 | 版本 |
|------|------|
| 操作系统 | Windows 10/11（64 位） |
| Node.js | v20+（推荐 v22+） |
| PowerShell | 5.1+（仅作 Rust 引擎回退） |
| VC++ 运行时 | [下载](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)（nut-js 需要） |

---

## 工具一览（31 个）

| 分类 | 工具 | 说明 |
|------|------|------|
| **🌐 主体路径** | `desktop_discover` | 观察桌面，返回带租约的可交互实体 |
| | `desktop_act` | 通过租约验证对实体操作（点击/输入/拖拽/选择） |
| **👁️ 观察** | `desktop_state` | 轻量焦点/窗口/光标/注意信号检查 |
| | `screenshot` | 多模式捕获（text/diff/dotByDot/background） |
| | `screenshot_query` / `screenshot_gc` | 截图缓存查询与清理 |
| | `workspace_snapshot` | 所有窗口缩略图 + UI 摘要 |
| | `server_status` | 原生引擎健康诊断 |
| **⌨️ 输入** | `keyboard` | 键盘输入，支持 IME 旁路 |
| | `mouse_click` / `mouse_drag` | 坐标交互 + 归位 + 强制焦点 |
| | `scroll` | 滚轮 / 定位元素 / 智能列表 / 拼接 |
| | `click_element` | UIA 按名称/ID 点击（回退） |
| **🌐 浏览器 CDP** | `browser_open` / `browser_navigate` | 幂等调试启动 + 导航 |
| | `browser_click` / `browser_fill` | 跨重绘稳定的 DOM 交互 |
| | `browser_eval` | JS 执行 / DOM 提取 / SPA 状态 |
| **🛠️ 工作流** | `terminal` | 命令执行（run/send/read），支持 exit 完成模式 |
| | `wait_until` | 窗口/焦点/文本/URL 状态轮询 |
| | `window_dock` / `focus_window` | 窗口吸附/置顶/聚焦 |
| | `workspace_launch` | 启动应用 + 自动检测新窗口 |
| | `run_macro` | 最多 50 个操作批量执行 |
| | `clipboard` / `notification_show` | 剪贴板 + 通知 |
| **📊 Office** | `excel` | VBA 宏写入与运行 |

---

## 标准工作流

```
desktop_state          → 定向：焦点窗口/元素、模态、注意信号
desktop_discover       → 查找可操作实体（返回 lease + windows[]）
desktop_act(lease, …)  → 操作实体（返回 attention + post.perception）
desktop_state          → 确认世界按预期变化
```

### 点击优先级

1. `browser_click(selector)` — Chrome/Edge CDP（跨重绘稳定）
2. `desktop_act(lease)` — 原生/对话框/视觉（基于实体）
3. `click_element(name | automationId)` — UIA 回退
4. `mouse_click(x, y, origin?, scale?)` — 像素级最后手段

### 恢复提示

| 信号 | 处理 |
|------|------|
| `lease_expired` / `*_mismatch` / `entity_not_found` | 重新 `desktop_discover` |
| `modal_blocking` | `click_element(name=blockingElement.name)` 关闭后重试 |
| `entity_outside_viewport` | `scroll(to_element)` 后重调 `desktop_discover` |
| `executor_failed` | 回退到 `click_element` / `mouse_click` / `browser_click` |

租约 TTL 自适应（上限 60s），`softExpiresAtMs` 约 60% 处 LLM 应考虑刷新。

---

## 截图参数速查

| 参数 | 效果 | Token |
|------|------|-------|
| `detail="image"` | PNG/WebP 像素（默认） | ~443 |
| `detail="text"` | UIA 元素 JSON + clickAt 坐标 | ~100-300 |
| `detail="meta"` | 仅标题+区域 | ~20/窗口 |
| `dotByDot=true` | 1:1 WebP，图像像素=屏幕坐标 | ~800 |
| `dotByDotMaxDimension=N` | 限制最长边，响应含 scale | — |
| `grayscale=true` | 灰度，文本类减小约 50% | — |
| `region={x,y,w,h}` | 窗口局部裁剪 | — |
| `diffMode=true` | 仅变化窗口（P帧） | ~160 |
| `ocrFallback="auto"` | UIA 稀疏时自动触发 Windows OCR | — |

**推荐流程：**
```
workspace_snapshot()                     → 全面定位
screenshot(detail="text", windowTitle=X) → 获取 clickAt 坐标
mouse_click(x, y)                        → 直接点击
screenshot(diffMode=true)                → 仅检查变化
```

---

## 浏览器 CDP 自动化

无需 Selenium/Playwright，只需启用 Chrome 远程调试端口：

```bash
chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\tmp\cdp
```

```
browser_open({launch:{}})                          → 启动 CDP Chrome + 列出标签
browser_click({selector:"#submit"})                → 查找+点击一步完成
browser_eval({action:"js", expression:"..."})      → 执行 JS
browser_fill({selector:"#email", value:"..."})     → 填充受控输入（React/Vue/Svelte 安全）
browser_navigate({url:"https://example.com"})      → CDP 导航
```

`browser_locate` 返回的坐标已含浏览器 UI 偏移和 DPI 缩放，可直接传给 `mouse_click`。

---

## 终端命令完成判定

`terminal(action='run')` 通过 `until` 参数控制"命令是否完成"：

| 模式 | 等待内容 | 适用场景 |
|------|----------|----------|
| `quiet`（默认） | 输出安静持续 `quietMs` | 短命令 |
| `pattern` | 输出匹配预期的字符串/正则 | 有已知结束标记的长命令 |
| `exit` | 命令真正**结束** + 返回退出码 | 需要完成码时 |

`exit` 模式注入与回显不同的完成标记，彻底解决哨兵误匹配问题：

```js
terminal({
  action: 'run', windowTitle: 'pwsh',
  input: 'npm run build',
  until: { mode: 'exit', shell: 'powershell' },
})
// → { reason: 'exited', exitCode: 0 }
```

支持的 shell：`bash`、`powershell`。`cmd.exe` 尚不支持。不安全输入（未关闭引号等）直接拒绝。

---

## 鼠标归位校正

截图获取坐标后窗口可能已移动，归位系统自动校正：

| 层级 | 启用方式 | 功能 |
|------|----------|------|
| 1 | 始终可用 | (dx, dy) 偏移修正 |
| 2 | 传 `windowTitle` | 窗口被遮挡时自动前置 |
| 3 | 传 `elementName` + `windowTitle` | UIA 重查缩放后的新坐标 |

```
mouse_click(x=500, y=300)                                      # 层级 1
mouse_click(x=500, y=300, windowTitle="记事本")                  # 层级 1+2
mouse_click(x=500, y=300, windowTitle="记事本", elementName="保存")  # 层级 1+2+3
mouse_click(x=500, y=300, homing=false)                         # 关闭归位
```

### origin + scale 坐标换算

`dotByDot` 截图带 `dotByDotMaxDimension` 时响应含 `origin` 和 `scale`，直接传入即可自动换算：

```
mouse_click(x=640, y=300, origin={x:0, y:120}, scale=0.6667, windowTitle="Chrome")
# 服务器换算: screen = (0 + 640/0.6667, 120 + 300/0.6667) = (960, 570)
```

---

## 自动防护

操作工具传入 `windowTitle` 时自动防护：

- ✅ 验证目标窗口身份（检测进程重启/HWND 替换）
- ✅ 确认点击坐标在窗口矩形内
- ✅ 失败时返回 `post.perception.status`，LLM 可无截图恢复

| 状态 | 含义 |
|------|------|
| `ok` | 防护通过 |
| `unguarded` | 未提供 windowTitle |
| `target_not_found` | 无匹配窗口 |
| `identity_changed` | 窗口已被替换 |
| `unsafe_coordinates` | 坐标在窗口矩形外 |
| `needs_escalation` | 需用 browser_click 或指定 windowTitle |

`unsafe_coordinates` 或 `identity_changed` 时可传 `fixId` 批准一次性恢复（15 秒过期）。

设置 `DESKTOP_TOUCH_AUTO_GUARD=0` 可禁用自动防护。

---

## 强制焦点

Windows 前台保护可能阻止按键到达目标窗口。`mouse_click`、`keyboard`、`terminal(send)` 均支持 `forceFocus: true`，通过 `AttachThreadInput` 绕过：

```json
{ "name": "mouse_click", "arguments": { "x": 500, "y": 300, "windowTitle": "Chrome", "forceFocus": true } }
```

全局默认：设 `DESKTOP_TOUCH_FORCE_FOCUS=1`。被拒绝时返回 `ok:false` + `code: "ForegroundRestricted"`，操作被抑制不误投。

---

## 自动停靠 CLI

MCP 启动时自动停靠承载 Claude 的终端：

```json
{
  "mcpServers": {
    "desktop-touch": {
      "env": {
        "DESKTOP_TOUCH_DOCK_TITLE": "@parent",
        "DESKTOP_TOUCH_DOCK_CORNER": "bottom-right",
        "DESKTOP_TOUCH_DOCK_WIDTH": "480",
        "DESKTOP_TOUCH_DOCK_HEIGHT": "360"
      }
    }
  }
}
```

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `DOCK_TITLE` | — | `@parent` 沿进程树查找终端，或用字面子串 |
| `DOCK_CORNER` | `bottom-right` | 四角可选 |
| `DOCK_WIDTH/HEIGHT` | `480/360` | px 或比例（如 `"25%"`） |
| `DOCK_PIN` | `true` | 置顶 |
| `DOCK_MONITOR` | 主显示器 | 显示器 ID |
| `DOCK_MARGIN` | `8` | 屏幕边缘填充（px） |

> ⚠️ 置顶窗口活动时按键会发到它而非目标。键盘操作前先 `focus_window(title=...)`。

---

## 截图缓存

`screenshot` 返回廉价的 `screenshot://by-ref/{id}` 链接而非内联像素，减少 token 消耗。

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `SCREENSHOTS_DIR` | 用户缓存目录 | 固定缓存路径 |
| `SCREENSHOT_MAX_COUNT` | `200` | 缓存上限 |
| `SCREENSHOT_MAX_BYTES` | `256 MiB` | 磁盘上限 |
| `SCREENSHOT_MAX_AGE_MS` | — | 超龄丢弃（opt-in） |
| `SCREENSHOT_AUTOPRUNE` | `on` | 新增时自动清理，`0` 禁用 |

---

## 自动感知（Always-on）

每个 `desktop_state` 和 `desktop_act` 响应自动附加 `attention` 信号，操作工具传 `windowTitle` 时自动防护。`lensId` 参数在操作工具上保留供高级固定目标使用。

---

## 安全机制

### 紧急停止（唯一安全机制）

**将鼠标移至屏幕左上角（0,0 附近 10px 以内）即立即终止 MCP 服务器。**

- 每次工具调用前检查 `checkFailsafe()`
- 500ms 后台轮询作为长操作后备
- 触发半径：10px

> 所有按键组合和应用启动均不受限制。键盘黑名单和应用黑名单已移除。

---

## 鼠标移动速度

`mouse_click`、`mouse_drag`、`scroll` 均支持 `speed` 参数：

| 值 | 行为 |
|----|------|
| 省略 | 默认 1500 px/秒 |
| `0` | 瞬移，无动画 |
| `1~N` | N px/秒动画 |

全局设置：`DESKTOP_TOUCH_MOUSE_SPEED=3000`。常用：`0`=瞬移，`1500`=柔和，`3000`=快速，`5000`=极速。

---

## 性能（Rust 原生引擎）

### UIA 基准

| 函数 | Rust 原生 | PowerShell | 加速比 |
|------|-----------|------------|--------|
| `getFocusedElement` | 2.2 ms | 366 ms | 163.9× |
| `getUiElements`（~60 元素） | 106.5 ms | 346 ms | 3.3× |
| **加权平均** | | | **~82×** |

### 图像差分（SSE2 SIMD）

| 函数 | Rust | TypeScript | 加速比 |
|------|------|------------|--------|
| `computeChangeFraction` | 0.26 ms | 3.8 ms | ~15× |
| `dHash` | 0.09 ms | 1.2 ms | ~13× |

### 架构

```
MCP 客户端
    │  stdio / HTTP
    ▼
TypeScript 服务层
    ├── Rust 原生引擎（.node 插件）
    │   ├── UIA: napi-rs + windows-rs，MTA COM 线程
    │   └── 图像: SSE2 SIMD 差分 + 感知哈希
    └── PowerShell 回退（引擎不可用时自动激活）
```

---

## UI 操作层 V2

`desktop_discover` / `desktop_act` 默认开启。设 `DESKTOP_TOUCH_DISABLE_FUKUWARAI_V2=1` 可禁用回退到 V1。

---

## 已知限制

| 限制 | 变通方法 |
|------|----------|
| 游戏/DirectX 全屏截图可能黑屏 | 用 `screenshot(mode:'background')` 或 BitBlt 回退 |
| Chrome/WinUI3 UIA 元素为空 | 自动 OCR 回退，或用 `browser_open` + CDP |
| `browser_*` 需 Chrome 以 `--remote-debugging-port` 启动 | 先关 Chrome，用 `browser_open({launch:{}})` |
| diff 缓冲区 90s 不活动后清除 | 长等待后调 `workspace_snapshot` 重置 |
| 置顶窗口活动时键盘发到错误窗口 | 先 `focus_window`，验证 `isActive=true` |
| Chrome 中长破折号/智能引号被拦截 | 用 `use_clipboard=true` |
| React/Vue/Svelte 受控输入 | 用 `browser_fill`（原生 setter + InputEvent） |

---

## Token 成本参考

| 模式 | Token | 用途 |
|------|-------|------|
| `screenshot`（768px） | ~443 | 一般视觉 |
| `screenshot(dotByDot)` | ~800 | 精确点击 |
| `screenshot(diffMode)` | ~160 | 操作后差异 |
| `screenshot(detail="text")` | ~100-300 | UI 交互（无图像） |
| `workspace_snapshot` | ~2000 | 全会话概览 |

---

## 环境变量汇总

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DESKTOP_TOUCH_API_KEY` | — | HTTP 模式 API 密钥，绑定非 localhost 时必填 |
| `DESKTOP_TOUCH_HOST` | `0.0.0.0` | HTTP 监听地址 |
| `DESKTOP_TOUCH_MOUSE_SPEED` | `1500` | 鼠标移动速度（px/秒） |
| `DESKTOP_TOUCH_FORCE_FOCUS` | — | 设 `1` 全局强制焦点 |
| `DESKTOP_TOUCH_AUTO_GUARD` | `on` | 设 `0` 禁用自动防护 |
| `DESKTOP_TOUCH_DOCK_TITLE` | — | 自动停靠标题（`@parent` 查终端） |
| `DESKTOP_TOUCH_DOCK_CORNER` | `bottom-right` | 停靠角落 |
| `DESKTOP_TOUCH_DOCK_WIDTH/HEIGHT` | `480/360` | 停靠尺寸 |
| `DESKTOP_TOUCH_DOCK_PIN` | `true` | 停靠置顶 |
| `DESKTOP_TOUCH_DOCK_MARGIN` | `8` | 停靠边距 |
| `DESKTOP_TOUCH_DISABLE_FUKUWARAI_V2` | — | 设 `1` 禁用 V2 工具 |
| `DESKTOP_TOUCH_MCP_HOME` | — | npx 缓存根目录 |
| `DESKTOP_TOUCH_SCREENSHOTS_DIR` | 用户缓存 | 截图缓存路径 |
| `DESKTOP_TOUCH_SCREENSHOT_MAX_COUNT` | `200` | 缓存数量上限 |
| `DESKTOP_TOUCH_SCREENSHOT_MAX_BYTES` | `256 MiB` | 缓存大小上限 |

---

## 许可证

MIT
