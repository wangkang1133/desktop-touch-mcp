#!/usr/bin/env node

/**
 * 将编译好的 desktop-touch-mcp 打包为可分发的 zip 文件。
 *
 * 用法: node scripts/pack-zip.mjs [--output 路径/输出.zip]
 *
 * 生成: desktop-touch-mcp-windows.zip，包含：
 *   dist/        — 编译后的 JS
 *   *.node       — Rust 原生插件（如存在）
 *   start.bat    — Windows 双击启动脚本
 *   package.json — 元数据
 *   LICENSE      — MIT 许可证
 *   README.md    — 中文文档
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const ROOT = import.meta.dirname ? path.resolve(import.meta.dirname, "..") : process.cwd();
const OUTPUT_DEFAULT = path.join(ROOT, "desktop-touch-mcp-windows.zip");

// 解析参数
const args = process.argv.slice(2);
let outputPath = OUTPUT_DEFAULT;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--output" && args[i + 1]) {
    outputPath = path.resolve(args[++i]);
  }
}

// 检查必要文件是否存在
const requiredPaths = [
  path.join(ROOT, "dist", "index.js"),
  path.join(ROOT, "start.bat"),
  path.join(ROOT, "package.json"),
  path.join(ROOT, "LICENSE"),
  path.join(ROOT, "README.md"),
];

for (const p of requiredPaths) {
  if (!existsSync(p)) {
    console.error(`[打包] 缺少必要文件: ${p}`);
    console.error(`[打包] 请先运行 'npm run build'，并确认 release 必需文件存在。`);
    process.exit(1);
  }
}

// 查找 .node 插件
const distDir = path.join(ROOT, "dist");
let nodeAddon = null;
function findNodeAddon(dir) {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith(".node")) return full;
    if (entry.isDirectory()) {
      const found = findNodeAddon(full);
      if (found) return found;
    }
  }
  return null;
}
nodeAddon = findNodeAddon(distDir);

// 构建要打包的文件列表
const filesToPack = [
  { src: path.join(ROOT, "dist"), dest: "dist" },
  { src: path.join(ROOT, "start.bat"), dest: "start.bat" },
  { src: path.join(ROOT, "package.json"), dest: "package.json" },
  { src: path.join(ROOT, "LICENSE"), dest: "LICENSE" },
  { src: path.join(ROOT, "README.md"), dest: "README.md" },
];

if (nodeAddon) {
  // 将 .node 文件也包含在 zip 根目录以便访问
  filesToPack.push({ src: nodeAddon, dest: path.relative(distDir, nodeAddon) });
}

async function copyToStaging(stagingDir) {
  await mkdir(stagingDir, { recursive: true });
  for (const item of filesToPack) {
    const dest = path.join(stagingDir, item.dest);
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(item.src, dest, { recursive: true, force: true });
  }
}

// 使用 PowerShell Compress-Archive（所有现代 Windows 都可用）
if (process.platform === "win32") {
  const stagingDir = path.join(os.tmpdir(), `dtmcp-pack-${Date.now()}`);

  async function pack() {
    await copyToStaging(stagingDir);

    if (existsSync(outputPath)) {
      await rm(outputPath, { force: true });
    }

    const script = `& { param($src, $dst) Compress-Archive -Path "$src\\*" -DestinationPath $dst -Force }`;
    try {
      execFileSync("powershell.exe", [
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
        script, stagingDir, outputPath,
      ], { stdio: "inherit" });
    } catch {
      execFileSync("pwsh.exe", [
        "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
        script, stagingDir, outputPath,
      ], { stdio: "inherit" });
    }

    await rm(stagingDir, { recursive: true, force: true });

    const sizeMB = (statSync(outputPath).size / 1024 / 1024).toFixed(1);
    console.log(`[打包] ✓ 已创建 ${outputPath} (${sizeMB} MB)`);
  }

  await pack();
} else {
  console.log(`[打包] 检测到非 Windows 平台。以下文件列表供手动打包:`);
  for (const item of filesToPack) {
    console.log(`  ${item.src} → ${item.dest}`);
  }
  console.log(`\n[打包] 在 Windows 上运行此脚本可自动生成 zip 包。`);
  console.log(`[打包] 或手动将这些文件打包为: ${path.basename(outputPath)}`);
}
