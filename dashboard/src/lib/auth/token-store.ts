/**
 * Auth-owned token store.
 *
 * Single source of truth for the current auth token, kept in memory and
 * mirrored to localStorage so it survives reloads. This module is intentionally
 * framework-agnostic (no React) so non-React consumers — e.g. the API client
 * (task T-002) — can read the token synchronously via {@link getAuthToken}
 * without importing React or the auth context.
 *
 * NOTE: the token is decoded (not verified) on the client. The backend remains
 * the sole authority for authorization; anything read here is advisory only.
 */

export const TOKEN_STORAGE_KEY = 'ai-usage-auth-token';

function readStored(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // localStorage unavailable (private mode / restricted context).
    return null;
  }
}

let currentToken: string | null = readStored();

/**
 * Returns the current auth token, or `null` if signed out.
 *
 * Intended entry point for the API client (T-002): call this to obtain the
 * bearer token for outbound requests, e.g. `Authorization: Bearer ${token}`.
 */
export function getAuthToken(): string | null {
  return currentToken;
}

/** Persists (or clears, when passed `null`) the auth token. */
export function setAuthToken(token: string | null): void {
  currentToken = token;
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Persistence failure is non-fatal; in-memory value still applies.
  }
}
