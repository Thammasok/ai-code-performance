import { Adapter, NormalizedUsageFields } from "../types";

/**
 * Parses Codex's hook/config-callback payload into canonical fields.
 * Same caveat as claude-code.ts: verify the actual field names against
 * current Codex CLI docs before shipping.
 */
export const codexAdapter: Adapter = (rawStdin: string): NormalizedUsageFields => {
  try {
    const raw = JSON.parse(rawStdin);
    return {
      toolVersion: raw.codex_version,
      model: raw.model,
      provider: "openai",
      tokensInput: raw.usage?.prompt_tokens,
      tokensOutput: raw.usage?.completion_tokens,
      sessionId: raw.session_id,
      project: raw.workspace_hash,
      status: raw.status === "ok" ? "success" : "error",
      accountEmailDomain: extractDomain(raw.account_email),
    };
  } catch {
    return {};
  }
};

function extractDomain(email?: string): string | undefined {
  if (!email || !email.includes("@")) return undefined;
  return email.split("@")[1];
}
