/**
 * Types shared across adapters, the IPC client, and the CLI entrypoint.
 *
 * IMPORTANT: this is the pre-signing, pre-identity shape sent to the local
 * daemon over IPC — NOT the same as ai-usage-backend's `submit-event`
 * input schema. The daemon adds event_id, machine_id, developer_id
 * (via signature), and the signature itself before calling the backend.
 * See docs/contracts/domain-ai-usage-backend.yaml for the backend shape,
 * and ADR-003 for why identity/signing never happens in this package.
 */

export type SupportedTool = "claude_code" | "codex" | "opencode";

export type HookEventName =
  | "session_start"
  | "session_stop"
  | "user_prompt_submit";

export type UsageStatus = "success" | "error" | "timeout";

/** Fields an adapter extracts from a tool's raw hook payload. All optional —
 *  not every tool/event exposes every field, and the daemon must tolerate
 *  partial data rather than reject it outright. */
export interface NormalizedUsageFields {
  toolVersion?: string;
  model?: string;
  provider?: "anthropic" | "openai" | "other";
  tokensInput?: number;
  tokensOutput?: number;
  tokensCached?: number;
  sessionId?: string;
  /** Hashed or allow-listed repo name — never a full filesystem path. */
  project?: string;
  latencyMs?: number;
  status?: UsageStatus;
  /** Secondary signal only — CLI-native account email domain, if the tool
   *  exposes it. Never treated as authoritative identity (ADR-003/004). */
  accountEmailDomain?: string;
}

/** The message this package sends to the local daemon over IPC. */
export interface RawHookMessage {
  tool: SupportedTool;
  hookEvent: HookEventName;
  fields: NormalizedUsageFields;
  /** Package's local clock at the moment the hook fired — the daemon may
   *  use or override this depending on clock-skew handling. */
  receivedAt: string;
}

/** An adapter turns a tool's raw stdin payload into NormalizedUsageFields.
 *  Adding a new tool = adding one adapter. Never touches cli.ts, the IPC
 *  client, or the daemon. */
export type Adapter = (rawStdin: string) => NormalizedUsageFields;
