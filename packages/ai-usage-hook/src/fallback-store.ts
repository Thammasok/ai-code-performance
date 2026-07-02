import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { RawHookMessage } from "./types";

const BASE_DIR = path.join(os.homedir(), ".mycompany-ai-usage");
const PENDING_DIR = path.join(BASE_DIR, "pending");

/**
 * Writes an event to a local pending file when the daemon is unreachable.
 * The daemon sweeps this directory on its own startup and whenever it
 * regains connectivity — this function never talks to the daemon directly.
 *
 * Deliberately synchronous and best-effort: if even this fails (e.g. disk
 * full, permissions), we swallow the error. Losing telemetry is acceptable;
 * blocking or crashing the developer's CLI hook is not (see DESIGN.md).
 */
export function writeFallback(message: RawHookMessage): void {
  try {
    fs.mkdirSync(PENDING_DIR, { recursive: true, mode: 0o700 });
    const filename = `${Date.now()}-${crypto.randomUUID()}.json`;
    const filepath = path.join(PENDING_DIR, filename);
    // 0o600: only the owning user can read/write. This directory should
    // additionally sit on a filesystem the daemon encrypts at rest — see
    // ADR-003 "Local buffer protection". This package does not encrypt;
    // that is the daemon's responsibility once it picks the file up.
    fs.writeFileSync(filepath, JSON.stringify(message), { mode: 0o600 });
  } catch {
    // Intentionally silent — see module docstring.
  }
}

export function debugLog(line: string): void {
  if (!process.env.AI_USAGE_DEBUG) return;
  try {
    fs.mkdirSync(BASE_DIR, { recursive: true, mode: 0o700 });
    const logPath = path.join(BASE_DIR, "debug.log");
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // Debug logging must never throw either.
  }
}
