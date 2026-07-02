/**
 * These mirror docs/contracts/domain-ai-usage-backend.yaml's `submit-event`
 * input_schema. Keep in sync manually for now — a future improvement is
 * generating this file directly from the contract YAML so drift is
 * impossible instead of just discouraged.
 */

export type SupportedTool = "claude_code" | "codex" | "opencode";
export type UsageStatus = "success" | "error" | "timeout";

/** What arrives from the package over IPC (see ai-usage-hook/src/types.ts). */
export interface RawHookMessage {
  tool: SupportedTool;
  hookEvent: "session_start" | "session_stop" | "user_prompt_submit";
  fields: {
    toolVersion?: string;
    model?: string;
    provider?: "anthropic" | "openai" | "other";
    tokensInput?: number;
    tokensOutput?: number;
    tokensCached?: number;
    sessionId?: string;
    project?: string;
    latencyMs?: number;
    status?: UsageStatus;
    accountEmailDomain?: string;
  };
  receivedAt: string;
}

/** Fully enriched event, ready to sign and upload — matches submit-event's
 *  input_schema exactly. developer_id is NEVER a field here: it is derived
 *  by the backend from the JWT signature, per ADR-003. */
export interface EnrichedEvent {
  event_id: string;
  tool: SupportedTool;
  tool_version?: string;
  model?: string;
  provider?: "anthropic" | "openai" | "other";
  tokens_input: number;
  tokens_output: number;
  tokens_cached: number;
  cost_estimate_usd?: number;
  session_id?: string;
  project?: string;
  machine_id: string;
  timestamp: string;
  latency_ms?: number;
  status: UsageStatus;
  account_email_domain?: string;
}

/** One row in the local encrypted buffer. */
export interface BufferRecord {
  event: EnrichedEvent;
  /** Base64 signature over JSON.stringify(event), produced at buffer-write
   *  time (ADR-003 "sign at creation", not at upload time). */
  signature: string;
  /** SHA-256 of the previous record's signature — hash-chains the buffer
   *  so deletions/edits of older entries are detectable (ADR-003
   *  "Detection"). The first record in the buffer uses a fixed genesis
   *  value instead of a real previous hash. */
  prevHash: string;
}
