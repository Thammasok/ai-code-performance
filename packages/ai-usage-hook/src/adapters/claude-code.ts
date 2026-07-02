import { Adapter, NormalizedUsageFields } from "../types";

/**
 * Parses Claude Code's hook stdin payload into canonical fields.
 *
 * NOTE: the exact shape of Claude Code's hook stdin JSON (field names for
 * model, token counts, session id, etc.) should be verified against current
 * Claude Code docs before shipping — hook payload shapes can change between
 * versions. This adapter is a best-effort scaffold showing where that
 * mapping lives, not a guarantee of the current wire format.
 */
export const claudeCodeAdapter: Adapter = (rawStdin: string): NormalizedUsageFields => {
  try {
    const raw = JSON.parse(rawStdin);
    const fields: NormalizedUsageFields = {
      toolVersion: raw.claude_code_version,
      model: raw.model,
      provider: "anthropic",
      tokensInput: raw.usage?.input_tokens,
      tokensOutput: raw.usage?.output_tokens,
      tokensCached: raw.usage?.cache_read_input_tokens,
      sessionId: raw.session_id,
      project: raw.cwd_hash ?? raw.project_name,
      status: raw.error ? "error" : "success",
      accountEmailDomain: extractDomain(raw.account_email),
    };
    return fields;
  } catch {
    // Malformed or unexpected payload shape — return an empty object.
    // cli.ts still forwards this so the daemon can at least record that
    // *a* Claude Code event fired, even without usage detail.
    return {};
  }
};

function extractDomain(email?: string): string | undefined {
  if (!email || !email.includes("@")) return undefined;
  return email.split("@")[1];
}
