/**
 * Event enrichment and signing for ai-usage-agent.
 *
 * Transforms RawHookMessage (from ai-usage-hook via IPC) into EnrichedEvent
 * (ready for backend submission) and signs with ES256.
 *
 * NOTE (ADR-003): developer_id is NEVER included in EnrichedEvent.
 * The backend derives it from the JWT signature verification result.
 */

import * as crypto from "crypto";
import * as os from "os";
import type { RawHookMessage, EnrichedEvent } from "./types";

/**
 * Computes a stable, pseudonymized machine identifier.
 * Uses SHA-256 hash of hostname + platform to avoid leaking identifiable info
 * while still allowing correlation of events from the same machine.
 */
function getMachineId(): string {
  const hostname = os.hostname();
  const platform = os.platform();
  const raw = `${hostname}:${platform}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

// Cache machine ID since it doesn't change during process lifetime
const MACHINE_ID = getMachineId();

/**
 * Transforms a RawHookMessage into an EnrichedEvent.
 *
 * Responsibilities:
 * - Generates unique event_id (UUID)
 * - Adds machine_id (hashed hostname)
 * - Uses receivedAt timestamp from hook
 * - Normalizes token counts (defaults to 0)
 * - Maps field names to snake_case per backend contract
 *
 * @param msg - Raw message from ai-usage-hook
 * @returns EnrichedEvent ready for signing and buffering
 */
export function enrich(msg: RawHookMessage): EnrichedEvent {
  const { tool, fields, receivedAt } = msg;

  return {
    event_id: crypto.randomUUID(),
    tool,
    tool_version: fields.toolVersion,
    model: fields.model,
    provider: fields.provider,
    tokens_input: fields.tokensInput ?? 0,
    tokens_output: fields.tokensOutput ?? 0,
    tokens_cached: fields.tokensCached ?? 0,
    // cost_estimate_usd intentionally omitted — backend computes this from model pricing
    session_id: fields.sessionId,
    project: fields.project,
    machine_id: MACHINE_ID,
    timestamp: receivedAt,
    latency_ms: fields.latencyMs,
    status: fields.status ?? "success",
    account_email_domain: fields.accountEmailDomain,
  };
}

/**
 * Signs an EnrichedEvent with ES256 (ECDSA using P-256 and SHA-256).
 *
 * The signature is created over the canonical JSON serialization of the event.
 * This signature is stored in the buffer alongside the event and later
 * included in the JWT for backend verification.
 *
 * @param event - The enriched event to sign
 * @param privateKeyPem - ES256 private key in PEM format
 * @returns Base64-encoded signature
 */
export function signEvent(event: EnrichedEvent, privateKeyPem: string): string {
  const data = JSON.stringify(event);
  const signature = crypto.sign("sha256", Buffer.from(data), privateKeyPem);
  return signature.toString("base64");
}

/**
 * Verifies an event signature (for testing/debugging).
 *
 * @param event - The enriched event that was signed
 * @param signature - Base64-encoded signature to verify
 * @param publicKeyPem - ES256 public key in PEM format
 * @returns true if signature is valid, false otherwise
 */
export function verifyEventSignature(
  event: EnrichedEvent,
  signature: string,
  publicKeyPem: string
): boolean {
  const data = JSON.stringify(event);
  return crypto.verify("sha256", Buffer.from(data), publicKeyPem, Buffer.from(signature, "base64"));
}
