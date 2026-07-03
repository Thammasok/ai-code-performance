/**
 * Minimal JWT payload decoding — DECODE ONLY, NO SIGNATURE VERIFICATION.
 *
 * The backend verifies the self-signed JWT and is the sole authority for
 * authorization (ADR-005). The SPA decodes claims purely to render identity and
 * gate navigation as defense-in-depth. Never treat these claims as trusted.
 */

export interface JwtClaims {
  /** Subject — the developer/user id. */
  sub?: string;
  email?: string;
  role?: string;
  /** Expiry, seconds since epoch. */
  exp?: number;
  [claim: string]: unknown;
}

/** Decodes a base64url segment to a UTF-8 string. */
function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = base64.length % 4 === 0 ? 0 : 4 - (base64.length % 4);
  const padded = base64 + '='.repeat(padLength);
  const binary = atob(padded);
  // Reinterpret the binary string as UTF-8.
  try {
    return decodeURIComponent(
      Array.from(binary, (ch) => {
        return '%' + ch.charCodeAt(0).toString(16).padStart(2, '0');
      }).join(''),
    );
  } catch {
    return binary;
  }
}

/**
 * Decodes a JWT's payload without verifying its signature.
 * Returns `null` for malformed input.
 */
export function decodeJwt(token: string): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(base64UrlDecode(parts[1]));
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    return parsed as JwtClaims;
  } catch {
    return null;
  }
}

/** True when the token's `exp` claim is present and in the past. */
export function isJwtExpired(
  claims: JwtClaims,
  nowSeconds: number = Date.now() / 1000,
): boolean {
  return typeof claims.exp === 'number' && claims.exp <= nowSeconds;
}
