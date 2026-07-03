import { useCallback, useMemo, useState } from 'react';
import {
  AuthContext,
  isRole,
  type AuthContextValue,
  type AuthUser,
  type Role,
  type SignInResult,
} from './auth-context';
import { decodeJwt, isJwtExpired } from './jwt';
import { getAuthToken, setAuthToken } from './token-store';

/**
 * Derives a session from a token by decoding (never verifying) its claims.
 * Returns `null` when the token is malformed, expired, or lacks a subject.
 */
function sessionFromToken(token: string): AuthUser | null {
  const claims = decodeJwt(token);
  if (!claims || isJwtExpired(claims)) {
    return null;
  }
  const id = typeof claims.sub === 'string' ? claims.sub : null;
  if (!id) {
    return null;
  }
  const email = typeof claims.email === 'string' ? claims.email : id;
  // Fail safe to least privilege when the role claim is missing/unrecognized;
  // the server is the true authority, so this only affects client-side gating.
  const role: Role = isRole(claims.role) ? claims.role : 'developer';
  return { id, email, role };
}

/** Rehydrates a session from a previously stored token, if still valid. */
function hydrate(): AuthUser | null {
  const token = getAuthToken();
  if (!token) {
    return null;
  }
  const session = sessionFromToken(token);
  if (!session) {
    // Stored token is stale/invalid — clear it so we start clean.
    setAuthToken(null);
  }
  return session;
}

/**
 * Provides the auth session app-wide. The current implementation is a pluggable
 * dev stub: {@link signIn} accepts a token and decodes it locally. Swapping in a
 * real OIDC/IdP device-code flow (ADR-003) means changing only this provider —
 * consumers of `useAuth()` and `getAuthToken()` stay untouched.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => hydrate());

  const signIn = useCallback((token: string): SignInResult => {
    const trimmed = token.trim();
    if (!trimmed) {
      return { ok: false, error: 'Enter a token to sign in.' };
    }
    const session = sessionFromToken(trimmed);
    if (!session) {
      return {
        ok: false,
        error: 'Token is invalid, expired, or missing a subject claim.',
      };
    }
    setAuthToken(trimmed);
    setUser(session);
    return { ok: true };
  }, []);

  const signOut = useCallback(() => {
    setAuthToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      getToken: getAuthToken,
      signIn,
      signOut,
    }),
    [user, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
