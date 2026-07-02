import { Adapter, NormalizedUsageFields } from "../types";

/**
 * Parses OpenCode's plugin/event hook payload into canonical fields.
 * Same caveat as the other adapters: verify against current OpenCode docs
 * before shipping. OpenCode has no native account login in most setups, so
 * accountEmailDomain is typically absent here — identity for this tool
 * relies on the local-agent key fallback path (ADR-003), not this field.
 */
export const opencodeAdapter: Adapter = (rawStdin: string): NormalizedUsageFields => {
  try {
    const raw = JSON.parse(rawStdin);
    return {
      toolVersion: raw.version,
      model: raw.model,
      provider: raw.provider ?? "other",
      tokensInput: raw.tokens?.input,
      tokensOutput: raw.tokens?.output,
      sessionId: raw.session,
      project: raw.project_hash,
      status: raw.success === false ? "error" : "success",
    };
  } catch {
    return {};
  }
};
