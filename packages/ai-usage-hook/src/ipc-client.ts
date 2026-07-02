import * as net from "net";
import * as path from "path";
import * as os from "os";
import { RawHookMessage } from "./types";
import { writeFallback, debugLog } from "./fallback-store";

const SOCKET_PATH =
  process.platform === "win32"
    ? "\\\\.\\pipe\\mycompany-ai-usage-daemon"
    : path.join(os.homedir(), ".mycompany-ai-usage", "daemon.sock");

/** Total time budget for the whole IPC round trip. Chosen to stay well
 *  under anything a developer would notice as CLI lag — see DESIGN.md
 *  "เร็วที่สุดเท่าที่จะทำได้". If this elapses without an ack, we fall
 *  back to the local file store rather than waiting any longer. */
const IPC_TIMEOUT_MS = 200;

/**
 * Sends one event to the local daemon. Never throws and never leaves the
 * process hanging — always resolves, and the caller (cli.ts) always exits
 * 0 regardless of the outcome. This function's only job is "deliver if
 * possible, fall back if not" — it makes no retry decisions itself.
 */
export function sendToDaemon(message: RawHookMessage): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (reason: string) => {
      if (settled) return;
      settled = true;
      debugLog(reason);
      socket.destroy();
      resolve();
    };

    const socket = net.createConnection(SOCKET_PATH);
    const timer = setTimeout(() => {
      writeFallback(message);
      finish("ipc timeout — wrote fallback file");
    }, IPC_TIMEOUT_MS);

    socket.on("connect", () => {
      socket.write(JSON.stringify(message) + "\n");
    });

    socket.on("data", (chunk) => {
      clearTimeout(timer);
      try {
        const ack = JSON.parse(chunk.toString().trim());
        if (ack.ok) {
          finish("daemon acked");
        } else {
          writeFallback(message);
          finish("daemon nacked — wrote fallback file");
        }
      } catch {
        writeFallback(message);
        finish("unparseable ack — wrote fallback file");
      }
    });

    socket.on("error", () => {
      clearTimeout(timer);
      writeFallback(message);
      finish("socket error (daemon likely not running) — wrote fallback file");
    });
  });
}
