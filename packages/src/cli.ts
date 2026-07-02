#!/usr/bin/env node

import { adapters, isSupportedTool } from "./adapters";
import { sendToDaemon } from "./ipc-client";
import { debugLog } from "./fallback-store";
import { HookEventName, RawHookMessage } from "./types";

const SUPPORTED_EVENTS: HookEventName[] = [
  "session_start",
  "session_stop",
  "user_prompt_submit",
];

/**
 * Entrypoint contract (see generated hook config in the provisioning
 * pipeline): `ai-usage-hook <tool> <hookEvent>`, with the tool's raw hook
 * payload piped in on stdin.
 *
 * Golden rule (DESIGN.md): this process ALWAYS exits 0. It never throws
 * uncaught, never blocks past IPC_TIMEOUT_MS, and never writes to
 * stdout/stderr unless AI_USAGE_DEBUG is set. Telemetry must never be able
 * to interfere with the developer's actual tool invocation.
 */
async function main(): Promise<void> {
  const [, , toolArg, eventArg] = process.argv;

  if (!toolArg || !isSupportedTool(toolArg)) {
    debugLog(`unsupported or missing tool argument: ${toolArg}`);
    return;
  }
  if (!eventArg || !SUPPORTED_EVENTS.includes(eventArg as HookEventName)) {
    debugLog(`unsupported or missing hook event argument: ${eventArg}`);
    return;
  }

  const rawStdin = await readStdin();
  const fields = adapters[toolArg](rawStdin);

  const message: RawHookMessage = {
    tool: toolArg,
    hookEvent: eventArg as HookEventName,
    fields,
    receivedAt: new Date().toISOString(),
  };

  await sendToDaemon(message);
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    // If stdin isn't piped (e.g. a tool that passes args instead), resolve
    // immediately with an empty string rather than hanging forever.
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

async function selfTest(): Promise<void> {
  const message: RawHookMessage = {
    tool: "claude_code",
    hookEvent: "session_start",
    fields: {},
    receivedAt: new Date().toISOString(),
  };
  await sendToDaemon(message);
  // Self-test intentionally still exits 0 either way — see DESIGN.md.
  // Result is only visible via AI_USAGE_DEBUG=1 debug.log.
}

if (process.argv[2] === "--self-test") {
  selfTest().finally(() => process.exit(0));
} else {
  main()
    .catch((err) => debugLog(`unexpected error: ${String(err)}`))
    .finally(() => process.exit(0));
}
