#!/usr/bin/env node

/**
 * desktop-touch-mcp 独立安装脚本
 *
 * 用法（无需 npm/npx）：
 *   node install.js [--dir 安装路径]
 *
 * 从 GitHub Releases 下载预编译 zip 包并解压安装。
 * 安装完成后直接运行：
 *   stdio 模式: node dist/index.js
 *   HTTP 模式:  node dist/index.js --http --port 23847 --key YOUR_KEY
 */

import { execFile } from "node:child_process";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// ── 配置 ──────────────────────────────────────────────────────────────────

const DEFAULT_VERSION = "1.11.0";
const ASSET_NAME = "desktop-touch-mcp-windows.zip";

function parseArgs() {
  const args = process.argv.slice(2);
  let version = DEFAULT_VERSION;
  let installDir = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir" && args[i + 1]) {
      installDir = args[++i];
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`desktop-touch-mcp 安装器

用法: node install.js [选项]

选项:
  --dir <路径>     安装目录（默认: ./desktop-touch-mcp）
  --help, -h       显示此帮助信息

示例:
  node install.js
  node install.js --dir C:\\Tools\\desktop-touch-mcp

安装后使用:
  stdio 模式:  node desktop-touch-mcp/dist/index.js
  HTTP 模式:   node desktop-touch-mcp/dist/index.js --http --port 23847 --key YOUR_KEY
`);
      process.exit(0);
    } else if (!args[i].startsWith("-")) {
      version = args[i];
    }
  }

  if (!installDir) {
    installDir = path.join(process.cwd(), "desktop-touch-mcp");
  }

  return { version, installDir };
}

// ── 辅助函数 ──────────────────────────────────────────────────────────────

function log(msg) { console.error(`[安装] ${msg}`); }
function fail(msg) { console.error(`[安装] 错误: ${msg}`); process.exit(1); }

function getGitHubHeaders() {
  const headers = { "User-Agent": "desktop-touch-mcp-installer" };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error, _stdout, stderr) => {
      if (error) {
        if (stderr) error.message += `\n${stderr}`;
        reject(error);
        return;
      }
      resolve();
    });
  });
}

// ── 下载 ──────────────────────────────────────────────────────────────────

async function downloadFile(url, destination) {
  log(`正在下载: ${url}`);
  const response = await fetch(url, { headers: getGitHubHeaders() });
  if (!response.ok) {
    throw new Error(`下载失败: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error("下载响应未包含内容");
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

// ── ZIP 解压 ──────────────────────────────────────────────────────────────

async function expandZip(zipPath, dest) {
  const script = "& { param($zip, $dest) Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force }";
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script, zipPath, dest];
  try {
    await run("powershell.exe", args);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await run("pwsh.exe", ["-NoLogo", ...args]);
  }
}

async function findExtractedRoot(extractDir) {
  if (existsSync(path.join(extractDir, "dist", "index.js"))) return extractDir;
  const entries = await readdir(extractDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(extractDir, entry.name);
    if (existsSync(path.join(candidate, "dist", "index.js"))) return candidate;
  }
  throw new Error("发布包中未找到 dist/index.js");
}

// ── 主流程 ────────────────────────────────────────────────────────────────

async function main() {
  const { version, installDir } = parseArgs();
  const tag = `v${version}`;
  const apiUrl = `https://api.github.com/repos/Harusame64/desktop-touch-mcp/releases/tags/${tag}`;

  log(`正在安装 desktop-touch-mcp ${tag} 到 ${installDir}`);

  // 1. 获取发布信息
  const response = await fetch(apiUrl, {
    headers: getGitHubHeaders({ Accept: "application/vnd.github+json" }),
  });
  if (!response.ok) {
    fail(`GitHub API 返回 ${response.status} 对应 ${tag}。请检查版本号是否正确。`);
  }
  const release = await response.json();
  const asset = Array.isArray(release.assets)
    ? release.assets.find((a) => a?.name === ASSET_NAME)
    : undefined;

  if (!asset?.browser_download_url) {
    fail(`版本 ${tag} 的发布中不包含 ${ASSET_NAME}`);
  }

  // 2. 下载并解压
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "dtmcp-install-"));
  const zipPath = path.join(tempDir, ASSET_NAME);
  const extractDir = path.join(tempDir, "extract");

  try {
    await downloadFile(asset.browser_download_url, zipPath);
    log("正在解压...");
    await mkdir(extractDir, { recursive: true });
    await expandZip(zipPath, extractDir);

    const extractedRoot = await findExtractedRoot(extractDir);

    // 3. 移动到安装目录
    if (existsSync(installDir)) {
      await rm(installDir, { recursive: true, force: true });
    }
    await mkdir(path.dirname(installDir), { recursive: true });
    await rename(extractedRoot, installDir);

    log(`✓ 已成功安装 desktop-touch-mcp ${tag} 到 ${installDir}`);
    log("");
    log("使用方法:");
    log(`  stdio 模式:  node "${path.join(installDir, 'dist', 'index.js')}"`);
    log(`  HTTP 模式:   node "${path.join(installDir, 'dist', 'index.js')}" --http --port 23847 --key YOUR_KEY`);
    log(`  健康检查:    curl http://0.0.0.0:23847/health`);

    // 非 Windows 平台提示
    if (process.platform !== "win32") {
      log("");
      log("注意: 您当前使用的是非 Windows 平台。服务器将以存根模式运行。");
      log("如需完整功能，请在 Windows 10/11 系统上安装使用。");
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

await main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
