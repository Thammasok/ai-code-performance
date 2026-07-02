import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { startIpcServer } from "./ipc-server";
import { FileKeyStore } from "./identity/keystore";
import { ensureProvisioned } from "./identity/provisioning";
import { BufferStore } from "./buffer/buffer-store";
import { enrich, signEvent } from "./enrich";
import { startUploadLoop } from "./uploader";
import { RawHookMessage } from "./types";

const PENDING_DIR = path.join(os.homedir(), ".mycompany-ai-usage", "pending");

async function main() {
  const backendUrl = process.env.AI_USAGE_BACKEND_URL;
  if (!backendUrl) {
    console.error("AI_USAGE_BACKEND_URL is required");
    process.exit(1);
  }

  const keyStore = new FileKeyStore(); // see DESIGN.md — swap for an OS-keychain-backed KeyStore before production use
  const identity = await ensureProvisioned(keyStore);
  const { privateKey } = keyStore.getSigningKeyPair();
  const bufferStore = new BufferStore(keyStore.getBufferEncryptionKey());

  const chainBreakIndex = bufferStore.verifyChain();
  if (chainBreakIndex !== -1) {
    console.error(
      `WARNING: buffer hash chain broken at record ${chainBreakIndex} — possible tampering. ` +
        `See ADR-003 "Detection". Continuing, but this should be reported.`
    );
  }

  function handleMessage(msg: RawHookMessage) {
    const enriched = enrich(msg);
    const signature = signEvent(enriched, privateKey);
    bufferStore.append({ event: enriched, signature });
  }

  sweepPendingFallbackFiles(handleMessage);

  const server = startIpcServer(handleMessage);
  const stopUploadLoop = startUploadLoop(bufferStore, {
    backendUrl,
    developerId: identity.developerId,
    privateKey,
  });

  process.on("SIGTERM", () => shutdown(server, stopUploadLoop));
  process.on("SIGINT", () => shutdown(server, stopUploadLoop));
}

/** Picks up events @mycompany/ai-usage-hook wrote to disk when this daemon
 *  wasn't reachable (self-healing per ADR-003 / DESIGN.md). */
function sweepPendingFallbackFiles(handleMessage: (msg: RawHookMessage) => void): void {
  if (!fs.existsSync(PENDING_DIR)) return;
  for (const filename of fs.readdirSync(PENDING_DIR)) {
    const filepath = path.join(PENDING_DIR, filename);
    try {
      const msg: RawHookMessage = JSON.parse(fs.readFileSync(filepath, "utf8"));
      handleMessage(msg);
      fs.unlinkSync(filepath);
    } catch {
      // Leave unparseable files in place rather than silently discarding
      // them — worth a human look, not worth crashing the daemon over.
    }
  }
}

function shutdown(server: import("net").Server, stopUploadLoop: () => void): void {
  stopUploadLoop();
  server.close(() => process.exit(0));
}

main().catch((err) => {
  console.error("Fatal error during daemon startup:", err);
  process.exit(1);
});
