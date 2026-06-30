#!/usr/bin/env node

/**
 * desktop-touch-mcp 简化启动器
 *
 * 安装流程：
 *   1. 从 GitHub Releases 下载预编译 zip 包
 *   2. 解压到 ~/.desktop-touch-mcp/releases/<tag>/
 *   3. 从解压目录启动 node dist/index.js
 *
 * 无需 npx、npm install 或构建步骤。
 * 支持 stdio 和 HTTP (--http) 两种传输模式。
 */

import { execFile, spawn } from "node:child_process";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

// ── Version & release config ──────────────────────────────────────────────────

const PACKAGE_VERSION = "1.11.2";
const RELEASE_TAG = `v${PACKAGE_VERSION}`;
const REPO_OWNER = "wangkang1133";
const REPO_NAME = "desktop-touch-mcp";
const REPO_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${RELEASE_TAG}`;
const ASSET_NAME = "desktop-touch-mcp-windows.zip";
const RELEASE_METADATA_FILE = ".desktop-touch-release.json";
const RELEASE_MANIFEST = {
  tagName: "v1.11.2",
  assetName: ASSET_NAME,
  sha256: "PENDING",
};

const CACHE_ROOT = process.env.DESKTOP_TOUCH_MCP_HOME
  ? path.resolve(process.env.DESKTOP_TOUCH_MCP_HOME)
  : path.join(os.homedir(), ".desktop-touch-mcp");
const RELEASES_DIR = path.join(CACHE_ROOT, "releases");
const CURRENT_FILE = path.join(CACHE_ROOT, "current.json");

// ── Logging helpers ──────────────────────────────────────────────────────────

function log(message) {
  console.error(`[desktop-touch-mcp] ${message}`);
}
function warn(message) {
  console.error(`[desktop-touch-mcp] 警告: ${message}`);
}
function fail(message) {
  console.error(`[desktop-touch-mcp] ${message}`);
  process.exit(1);
}

// ── Allow unverified release (dev mode) ──────────────────────────────────────

function allowUnverifiedRelease() {
  return process.env.DESKTOP_TOUCH_MCP_ALLOW_UNVERIFIED === "1";
}

// ── GitHub API helpers ────────────────────────────────────────────────────────

function getGitHubToken() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
}

function getGitHubHeaders(extra = {}) {
  const headers = { "User-Agent": "desktop-touch-mcp-launcher", ...extra };
  const token = getGitHubToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// ── Stdio wiring ─────────────────────────────────────────────────────────────

export function isDisconnectError(error) {
  return error?.code === "EPIPE" || error?.code === "ERR_STREAM_DESTROYED";
}

export function wireLauncherStdio(child, options = {}) {
  const parentStdin = options.parentStdin ?? process.stdin;
  const parentStdout = options.parentStdout ?? process.stdout;
  const parentStderr = options.parentStderr ?? process.stderr;
  const shutdownGraceMs = options.shutdownGraceMs ?? 1000;

  let shutdownRequested = false;
  let forcedShutdownTimer = null;

  function clearForcedShutdownTimer() {
    if (forcedShutdownTimer !== null) {
      clearTimeout(forcedShutdownTimer);
      forcedShutdownTimer = null;
    }
  }

  function requestChildShutdown() {
    if (shutdownRequested) return;
    shutdownRequested = true;
    try { child.stdin?.end(); } catch { /* ignore */ }
    forcedShutdownTimer = setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        try { child.kill("SIGTERM"); } catch { /* ignore */ }
      }
    }, shutdownGraceMs);
    if (forcedShutdownTimer.unref) forcedShutdownTimer.unref();
  }

  function terminateChild() {
    clearForcedShutdownTimer();
    if (child.exitCode === null && !child.killed) {
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
    }
  }

  parentStdin.pipe(child.stdin);
  child.stdout?.pipe(parentStdout);
  child.stderr?.pipe(parentStderr);

  parentStdin.on("end", requestChildShutdown);
  parentStdin.on("close", requestChildShutdown);
  parentStdin.on("error", requestChildShutdown);

  const onParentOutputError = (error) => {
    if (isDisconnectError(error)) terminateChild();
  };
  parentStdout.on("error", onParentOutputError);
  parentStderr.on("error", onParentOutputError);

  child.stdin?.on("error", (error) => {
    if (!isDisconnectError(error)) throw error;
  });
  child.on("exit", clearForcedShutdownTimer);
}

// ── Release directory helpers ────────────────────────────────────────────────

function tagToDirName(tagName) {
  const safe = String(tagName || "latest").replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe || "latest";
}

function releaseDirForTag(tagName) {
  return path.join(RELEASES_DIR, tagToDirName(tagName));
}

function releaseMetadataPath(releaseDir) {
  return path.join(releaseDir, RELEASE_METADATA_FILE);
}

// ── Release validation ───────────────────────────────────────────────────────

function expectedReleaseSpec() {
  if (RELEASE_MANIFEST.tagName !== RELEASE_TAG) {
    throw new Error(`Release manifest mismatch: PACKAGE_VERSION=${PACKAGE_VERSION}, manifest=${RELEASE_MANIFEST.tagName}`);
  }
  if (!RELEASE_MANIFEST.sha256 || RELEASE_MANIFEST.assetName !== ASSET_NAME) {
    throw new Error(`Missing release manifest for ${RELEASE_TAG}`);
  }
  const isPending = RELEASE_MANIFEST.sha256 === "PENDING";
  if (isPending && !allowUnverifiedRelease()) {
    throw new Error(
      `Release SHA256 manifest for ${RELEASE_TAG} is PENDING. ` +
      `Set DESKTOP_TOUCH_MCP_ALLOW_UNVERIFIED=1 to skip verification (dev only).`
    );
  }
  if (!isPending && !/^[a-f0-9]{64}$/i.test(RELEASE_MANIFEST.sha256)) {
    throw new Error(`Invalid release SHA256 manifest for ${RELEASE_TAG}`);
  }
  return {
    tagName: RELEASE_MANIFEST.tagName,
    assetName: RELEASE_MANIFEST.assetName,
    sha256: isPending ? null : String(RELEASE_MANIFEST.sha256).toLowerCase(),
    sha256Pending: isPending,
  };
}

// ── Release metadata I/O ─────────────────────────────────────────────────────

async function readReleaseMetadata(releaseDir) {
  try {
    const raw = await readFile(releaseMetadataPath(releaseDir), "utf8");
    return JSON.parse(raw);
  } catch { return null; }
}

async function isInstalled(releaseDir, expected) {
  if (!existsSync(path.join(releaseDir, "dist", "index.js"))) return false;
  const metadata = await readReleaseMetadata(releaseDir);
  if (!metadata) return false;
  if (metadata.tagName !== expected.tagName || metadata.assetName !== expected.assetName) return false;
  if (expected.sha256 !== null) {
    if (String(metadata.sha256 || "").toLowerCase() !== expected.sha256) return false;
  }
  return true;
}

async function readCurrentRelease(expected) {
  try {
    const raw = await readFile(CURRENT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.tagName !== "string") return null;
    if (parsed.tagName !== expected.tagName) return null;
    if (parsed.assetName !== expected.assetName) return null;
    if (expected.sha256 !== null && String(parsed.sha256 || "").toLowerCase() !== expected.sha256) return null;
    const releaseDir = releaseDirForTag(parsed.tagName);
    if (!(await isInstalled(releaseDir, expected))) return null;
    return { tagName: parsed.tagName, releaseDir };
  } catch { return null; }
}

async function writeReleaseMetadata(releaseDir, expected) {
  await writeFile(
    releaseMetadataPath(releaseDir),
    `${JSON.stringify({ ...expected, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
}

async function writeCurrentRelease(expected) {
  await mkdir(CACHE_ROOT, { recursive: true });
  await writeFile(
    CURRENT_FILE,
    `${JSON.stringify({ ...expected, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
}

// ── GitHub release fetch ─────────────────────────────────────────────────────

async function fetchReleaseByTag(expected) {
  const response = await fetch(REPO_API_URL, {
    headers: getGitHubHeaders({ "Accept": "application/vnd.github+json" }),
  });
  if (!response.ok) {
    throw new Error(`GitHub Releases API returned ${response.status} ${response.statusText} for ${expected.tagName}`);
  }
  const release = await response.json();
  const asset = Array.isArray(release.assets)
    ? release.assets.find((entry) => entry?.name === ASSET_NAME)
    : undefined;
  if (!release.tag_name || !asset?.browser_download_url) {
    throw new Error(`Release ${expected.tagName} does not contain ${ASSET_NAME}`);
  }
  const tagName = String(release.tag_name);
  if (!/^v\d+\.\d+\.\d+$/.test(tagName)) {
    throw new Error(`Unexpected tag format: ${tagName}`);
  }
  if (tagName !== expected.tagName) {
    throw new Error(`Unexpected tag: expected ${expected.tagName}, got ${tagName}`);
  }
  return { tagName, assetUrl: asset.browser_download_url };
}

// ── SHA-256 verification ─────────────────────────────────────────────────────

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
  });
  return hash.digest("hex").toLowerCase();
}

async function verifySha256(filePath, expectedSha256) {
  const actual = await sha256File(filePath);
  const expected = String(expectedSha256).toLowerCase();
  if (actual !== expected) {
    throw new Error(`SHA256 mismatch for ${ASSET_NAME}: expected ${expected}, got ${actual}`);
  }
}

// ── File download ─────────────────────────────────────────────────────────────

async function downloadFile(url, destination) {
  const response = await fetch(url, { headers: getGitHubHeaders() });
  if (!response.ok) {
    throw new Error(`Download failed with ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error("Download response did not include a body");
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

// ── Zip extraction ────────────────────────────────────────────────────────────

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error, _stdout, stderr) => {
      if (error) {
        const suffix = stderr ? `\n${stderr}` : "";
        error.message = `${error.message}${suffix}`;
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function expandZip(zipPath, destination) {
  const script = "& { param($zip, $dest) Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force }";
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script, zipPath, destination];
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
  throw new Error("Release zip did not contain dist/index.js");
}

// ── Install from release ─────────────────────────────────────────────────────

async function installRelease(release, expected) {
  await mkdir(RELEASES_DIR, { recursive: true });
  const targetDir = releaseDirForTag(release.tagName);
  const tempDir = await mkdtemp(path.join(CACHE_ROOT, "download-"));
  const zipPath = path.join(tempDir, ASSET_NAME);
  const extractDir = path.join(tempDir, "extract");

  try {
    log(`正在从 ${release.tagName} 下载 ${ASSET_NAME}...`);
    await downloadFile(release.assetUrl, zipPath);
    if (expected.sha256 !== null) {
      await verifySha256(zipPath, expected.sha256);
    } else {
      warn("SHA256 清单状态为 PENDING — 跳过完整性验证（仅限开发环境）。");
    }
    await mkdir(extractDir, { recursive: true });
    await expandZip(zipPath, extractDir);

    const extractedRoot = await findExtractedRoot(extractDir);
    await rm(targetDir, { recursive: true, force: true });
    await rename(extractedRoot, targetDir);
    await writeReleaseMetadata(targetDir, expected);
    await writeCurrentRelease(expected);
    log(`已安装 ${release.tagName} 到 ${targetDir}`);
    return targetDir;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// ── Ensure release is installed ──────────────────────────────────────────────

async function ensureRelease() {
  const expected = expectedReleaseSpec();
  const targetDir = releaseDirForTag(expected.tagName);
  if (await isInstalled(targetDir, expected)) {
    await writeCurrentRelease(expected);
    return targetDir;
  }
  const current = await readCurrentRelease(expected);
  if (current) return current.releaseDir;

  const release = await fetchReleaseByTag(expected);
  return installRelease(release, expected);
}

// ── Launch server ─────────────────────────────────────────────────────────────

function launchServer(releaseDir) {
  const entry = path.join(releaseDir, "dist", "index.js");
  const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
    cwd: releaseDir,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: false,
  });

  wireLauncherStdio(child);

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      if (!child.killed) child.kill(signal);
    });
  }

  child.on("error", (error) => {
    fail(`启动运行时失败: ${error.message}`);
  });

  child.on("exit", (code, signal) => {
    if (signal) { process.exit(1); return; }
    process.exit(code ?? 0);
  });
}

// ── Main entry ────────────────────────────────────────────────────────────────

async function main() {
  // Print help
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`desktop-touch-mcp v${PACKAGE_VERSION}

用法: desktop-touch-mcp [选项]

快速安装（无需 npm/npx）：
  1. 下载:  curl -LO https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${RELEASE_TAG}/desktop-touch-mcp-windows.zip
  2. 解压:   Expand-Archive desktop-touch-mcp-windows.zip -DestinationPath C:\\desktop-touch-mcp
  3. stdio: node C:\\desktop-touch-mcp\\dist\\index.js
  4. HTTP:  node C:\\desktop-touch-mcp\\dist\\index.js --http --port 23847 --key YOUR_KEY

选项:
  --http          使用 Streamable HTTP 传输（默认: stdio）
  --port <端口>   HTTP 端口（默认: 23847，需配合 --http）
  --host <地址>   HTTP 绑定地址（默认: 0.0.0.0，需配合 --http）
  --key <密钥>    HTTP 认证 API 密钥（或设置 DESKTOP_TOUCH_API_KEY 环境变量）
  -h, --help      显示此帮助信息

HTTP 模式认证：
  绑定到 0.0.0.0 时 API 密钥为必填项。
  通过 --key 参数或 DESKTOP_TOUCH_API_KEY 环境变量设置。
  客户端请求头: Authorization: Bearer <密钥>

传输模式:
  stdio  — 命令行/MCP 宿主直连集成（Claude Code、Cursor 等）
  http   — 远程/局域网访问；配合 API 密钥确保安全
`);
    process.exit(0);
  }

  const releaseDir = await ensureRelease();
  launchServer(releaseDir);
}

// ── Auto-run when invoked as script ──────────────────────────────────────────

const launchedAsScript = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
})();

if (launchedAsScript) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
