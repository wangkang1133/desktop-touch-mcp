/**
 * key-safety.test.ts — Unit tests for assertKeyComboSafe
 *
 * 定制版策略：键盘组合黑名单已移除，assertKeyComboSafe 保留 API 兼容性但不再拦截。
 * 唯一保留的安全机制是运行时 Emergency Stop（鼠标左上角）。
 */

import { describe, it, expect } from "vitest";
import { assertKeyComboSafe, isKeyComboBlocked } from "../../src/utils/key-safety.js";

describe("assertKeyComboSafe — 定制版全部放行", () => {
  const combos = [
    "win+r",
    "win+x",
    "win+s",
    "win+l",
    "WIN+R",
    "Win+R",
    "meta+r",
    "super+r",
    "Super+L",
    "ctrl+s",
    "alt+f4",
    "alt+tab",
    "escape",
    "f5",
  ];

  for (const combo of combos) {
    it(`allows ${combo}`, () => {
      expect(() => assertKeyComboSafe(combo)).not.toThrow();
      expect(isKeyComboBlocked(combo)).toBe(false);
    });
  }

  it("does not throw BlockedKeyComboError for formerly blocked combos", () => {
    expect(() => assertKeyComboSafe("win+r")).not.toThrow();
    expect(() => assertKeyComboSafe("super+x")).not.toThrow();
  });
});
