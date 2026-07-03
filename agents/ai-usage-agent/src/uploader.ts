/**
 * HTTP uploader for sending events to ai-usage-backend.
 *
 * Features:
 * - Self-signed ES256 JWT authentication (per ADR-003)
 * - Exponential backoff on failures (1s → 5min max)
 * - Periodic sweep of pending buffer records
 *
 * JWT format expected by backend (see backend/ai-usage-backend/src/domain/auth.rs):
 * - Header: { "alg": "ES256", "typ": "JWT" }
 * - Payload: { "sub": developerId, "iat": now, "exp": now+300, "jti": eventId }
 * - Signature: ES256 over header.payload
 */

import * as crypto from "crypto";
import type { BufferStore } from "./buffer/buffer-store";

export interface UploaderOptions {
  backendUrl: string;
  developerId: string;
  privateKey: string; // ES256 private key in PEM format
}

const SWEEP_INTERVAL_MS = 5000; // 5 seconds between sweeps
const INITIAL_BACKOFF_MS = 1000; // 1 second
const MAX_BACKOFF_MS = 300000; // 5 minutes

/**
 * Starts the upload loop that periodically sweeps the buffer and uploads events.
 *
 * @param bufferStore - The buffer store to sweep for pending events
 * @param options - Backend URL, developer ID, and private key
 * @returns Stop function to cleanly shut down the upload loop
 */
export function startUploadLoop(
  bufferStore: BufferStore,
  options: UploaderOptions
): () => void {
  let running = true;
  let currentBackoff = INITIAL_BACKOFF_MS;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  async function sweep(): Promise<void> {
    if (!running) return;

    let hadFailure = false;

    for (const record of bufferStore.pendingRecords()) {
      if (!running) break;

      const eventId = record.event.event_id;

      try {
        const jwt = createJwt(options.developerId, eventId, options.privateKey);

        const response = await fetch(options.backendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            event: record.event,
            signature: record.signature,
          }),
        });

        if (response.ok) {
          bufferStore.markUploaded(eventId);
          currentBackoff = INITIAL_BACKOFF_MS; // Reset backoff on success
          console.log(`Uploaded event ${eventId}`);
        } else if (response.status === 401) {
          // Auth failure - likely key not registered or expired JWT
          console.error(
            `Auth failed for event ${eventId} (401). ` +
              `Ensure developer is registered with backend. Retrying later.`
          );
          hadFailure = true;
          break; // Don't retry immediately - auth issue won't resolve quickly
        } else if (response.status === 409) {
          // Duplicate - already processed, safe to remove
          bufferStore.markUploaded(eventId);
          console.log(`Event ${eventId} already processed (409), removing from buffer`);
        } else {
          const body = await response.text();
          console.error(`Upload failed for ${eventId}: ${response.status} ${body}`);
          hadFailure = true;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(`Network error uploading ${eventId}: ${errorMsg}`);
        hadFailure = true;
        break; // Don't hammer the server if it's down
      }
    }

    if (!running) return;

    // Schedule next sweep with backoff if there were failures
    const nextInterval = hadFailure ? currentBackoff : SWEEP_INTERVAL_MS;

    if (hadFailure) {
      currentBackoff = Math.min(currentBackoff * 2, MAX_BACKOFF_MS);
      console.log(`Backing off, next sweep in ${nextInterval / 1000}s`);
    }

    timeoutId = setTimeout(sweep, nextInterval);
  }

  // Start first sweep
  timeoutId = setTimeout(sweep, SWEEP_INTERVAL_MS);
  console.log(`Upload loop started, sweeping every ${SWEEP_INTERVAL_MS / 1000}s`);

  // Return stop function
  return () => {
    running = false;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    console.log("Upload loop stopped");
  };
}

/**
 * Creates a self-signed ES256 JWT for authenticating with the backend.
 *
 * The backend verifies:
 * 1. Signature is valid using developer's registered public key
 * 2. Token is not expired (exp claim)
 * 3. jti (event_id) for idempotency
 *
 * @param developerId - UUID of the developer (goes in "sub" claim)
 * @param eventId - Event ID for idempotency (goes in "jti" claim)
 * @param privateKeyPem - ES256 private key in PEM format
 * @returns Signed JWT string
 */
function createJwt(developerId: string, eventId: string, privateKeyPem: string): string {
  const header = { alg: "ES256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: developerId,
    iat: now,
    exp: now + 300, // 5 minute expiry
    jti: eventId,
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Sign with ES256 (ECDSA using P-256 and SHA-256)
  const signature = crypto.sign("sha256", Buffer.from(signingInput), privateKeyPem);

  // Convert signature from DER to raw R||S format for JWT
  // ES256 signatures should be 64 bytes (32 for R, 32 for S)
  const rawSignature = derToRaw(signature);
  const sigB64 = base64url(rawSignature);

  return `${headerB64}.${payloadB64}.${sigB64}`;
}

/**
 * Converts a DER-encoded ECDSA signature to raw R||S format.
 * Node.js crypto.sign outputs DER format, but JWT expects raw format.
 */
function derToRaw(derSignature: Buffer): Buffer {
  // DER format: 0x30 [length] 0x02 [r-length] [r] 0x02 [s-length] [s]
  // We need to extract R and S, pad/trim to 32 bytes each

  let offset = 0;

  // Check sequence tag
  if (derSignature[offset++] !== 0x30) {
    throw new Error("Invalid DER signature: missing sequence tag");
  }

  // Skip sequence length
  let seqLen = derSignature[offset++];
  if (seqLen & 0x80) {
    // Long form length (shouldn't happen for ECDSA)
    const lenBytes = seqLen & 0x7f;
    offset += lenBytes;
  }

  // Read R
  if (derSignature[offset++] !== 0x02) {
    throw new Error("Invalid DER signature: missing R integer tag");
  }
  let rLen = derSignature[offset++];
  let r = derSignature.subarray(offset, offset + rLen);
  offset += rLen;

  // Read S
  if (derSignature[offset++] !== 0x02) {
    throw new Error("Invalid DER signature: missing S integer tag");
  }
  let sLen = derSignature[offset++];
  let s = derSignature.subarray(offset, offset + sLen);

  // Normalize R and S to 32 bytes each
  r = normalizeInteger(r, 32);
  s = normalizeInteger(s, 32);

  return Buffer.concat([r, s]);
}

/**
 * Normalizes an integer to a fixed length by trimming leading zeros or padding.
 */
function normalizeInteger(buf: Buffer, targetLen: number): Buffer {
  // Remove leading zero padding (added for sign in DER)
  while (buf.length > targetLen && buf[0] === 0) {
    buf = buf.subarray(1);
  }

  // Pad with leading zeros if too short
  if (buf.length < targetLen) {
    const padded = Buffer.alloc(targetLen);
    buf.copy(padded, targetLen - buf.length);
    return padded;
  }

  return buf;
}

/**
 * Base64url encoding without padding (RFC 7515).
 */
function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
