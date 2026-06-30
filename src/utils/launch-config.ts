/**
 * launch-config.ts — 启动配置。
 *
 * 白名单/黑名单系统已被移除。所有可执行文件
 * 现在均可在 workspace_launch 中启动。仅保留
 * 紧急停止安全机制（鼠标移至左上角）。
 */

/**
 * 始终返回 false——无可执行文件被阻止。
 */
export function isExecutableBlocked(_command: string): boolean {
  return false;
}

/**
 * 始终返回 true——所有可执行文件均视为已允许。
 */
export function isExecutableAllowlisted(_command: string): boolean {
  return true;
}

/**
 * 空操作：返回空集合。不再读取白名单文件。
 */
export function getAllowedExecutables(): Set<string> {
  return new Set();
}
