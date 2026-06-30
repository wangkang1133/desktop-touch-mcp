/**
 * 按键组合安全模块。
 *
 * 所有按键组合现已允许——之前的黑名单
 * （Win+R、Win+X、Win+S、Win+L）已被移除。
 * 仅保留紧急停止安全机制（鼠标移至左上角）。
 */

/**
 * 空操作：所有按键组合均允许。
 */
export function assertKeyComboSafe(_combo: string): void {
  // 所有组合均允许——无限制。
}

/**
 * 始终返回 false——无组合被阻止。
 */
export function isKeyComboBlocked(_combo: string): boolean {
  return false;
}
