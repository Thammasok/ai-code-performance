/**
 * IPC server for receiving events from ai-usage-hook.
 *
 * Protocol:
 * - Socket path:
 *   - Windows: \\.\pipe\mycompany-ai-usage-daemon
 *   - Unix: ~/.mycompany-ai-usage/daemon.sock
 * - Each connection sends one JSON line (RawHookMessage)
 * - Server responds with {"ok": true} or {"ok": false, "error": "..."}
 * - Client expects response within 200ms (timeout)
 *
 * Per ADR-003: Hook must NEVER block CLI operations. This server is designed
 * to respond quickly and handle failures gracefully.
 */

import * as net from "net";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { RawHookMessage } from "./types";

const SOCKET_DIR = path.join(os.homedir(), ".mycompany-ai-usage");
const UNIX_SOCKET_PATH = path.join(SOCKET_DIR, "daemon.sock");
const WINDOWS_PIPE_NAME = "\\\\.\\pipe\\mycompany-ai-usage-daemon";

/**
 * Returns the appropriate socket path for the current platform.
 */
export function getSocketPath(): string {
  return process.platform === "win32" ? WINDOWS_PIPE_NAME : UNIX_SOCKET_PATH;
}

/**
 * Starts the IPC server for receiving events from ai-usage-hook.
 *
 * @param onMessage - Callback invoked for each valid RawHookMessage received
 * @returns The net.Server instance (call server.close() to shut down)
 */
export function startIpcServer(onMessage: (msg: RawHookMessage) => void): net.Server {
  const socketPath = getSocketPath();

  // Clean up stale socket file on Unix (Windows named pipes auto-clean)
  if (process.platform !== "win32" && fs.existsSync(socketPath)) {
    try {
      fs.unlinkSync(socketPath);
    } catch {
      // Ignore - may fail if another instance is running
    }
  }

  // Ensure socket directory exists
  if (process.platform !== "win32" && !fs.existsSync(SOCKET_DIR)) {
    fs.mkdirSync(SOCKET_DIR, { recursive: true, mode: 0o700 });
  }

  const server = net.createServer((socket) => {
    let buffer = "";

    socket.on("data", (chunk) => {
      buffer += chunk.toString();

      // Protocol: single JSON line per connection
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) {
        return; // Wait for complete line
      }

      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      try {
        const msg = JSON.parse(line) as RawHookMessage;

        // Basic validation
        if (!msg.tool || !msg.hookEvent || !msg.fields || !msg.receivedAt) {
          socket.write(JSON.stringify({ ok: false, error: "Invalid message format" }) + "\n");
          socket.end();
          return;
        }

        // Process the message
        try {
          onMessage(msg);
          socket.write(JSON.stringify({ ok: true }) + "\n");
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          console.error("Error processing message:", errorMsg);
          socket.write(JSON.stringify({ ok: false, error: errorMsg }) + "\n");
        }
      } catch {
        socket.write(JSON.stringify({ ok: false, error: "Invalid JSON" }) + "\n");
      }

      socket.end();
    });

    socket.on("error", (err) => {
      // Log but don't crash - client may have disconnected
      console.error("Socket error:", err.message);
    });

    // Timeout to prevent hanging connections
    socket.setTimeout(5000);
    socket.on("timeout", () => {
      socket.end();
    });
  });

  server.on("error", (err) => {
    console.error("IPC server error:", err.message);
    // Don't crash on server errors - let the main process handle it
  });

  server.listen(socketPath, () => {
    console.log(`IPC server listening on ${socketPath}`);

    // Set restrictive permissions on Unix socket
    if (process.platform !== "win32") {
      try {
        fs.chmodSync(socketPath, 0o600);
      } catch {
        // Non-fatal - socket may still work
      }
    }
  });

  return server;
}
