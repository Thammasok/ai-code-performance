import { Adapter, SupportedTool } from "../types";
import { claudeCodeAdapter } from "../adapters/claude-code";
import { codexAdapter } from "./codex";
import { opencodeAdapter } from "../adapters/opencode";

/**
 * Adding support for a new AI CLI tool means: write one adapter file,
 * register it here. Nothing else in this package changes — this is the
 * hexagonal adapter pattern agreed in ADR-003 applied at the package level.
 */
export const adapters: Record<SupportedTool, Adapter> = {
  claude_code: claudeCodeAdapter,
  codex: codexAdapter,
  opencode: opencodeAdapter,
};

export function isSupportedTool(value: string): value is SupportedTool {
  return value in adapters;
}
