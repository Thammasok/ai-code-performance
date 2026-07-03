import { createContext, useContext } from 'react';

/** RBAC roles, per ADR-005. */
export const ROLES = [
  'developer',
  'manager',
  'platform_admin',
  'auditor',
] as const;

export type Role = (typeof ROLES)[number];

/** Runtime guard for narrowing an unknown claim to a {@link Role}. */
export function isRole(value: unknown): value is Role {
  return (
    typeof value === 'string' && (ROLES as readonly string[]).includes(value)
  );
}

/** The signed-in user's identity, derived from decoded JWT claims. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export type SignInResult = { ok: true } | { ok: false; error: string };

export interface AuthContextValue {
  /** Current user, or `null` when signed out. */
  user: AuthUser | null;
  /** Convenience flag: `user !== null`. */
  isAuthenticated: boolean;
  /**
   * Accessor for the raw auth token. Delegates to the framework-agnostic token
   * store so React and non-React consumers share one source of truth.
   */
  getToken: () => string | null;
  /**
   * Establishes a session from a token (dev stub decodes claims locally). A real
   * OIDC/IdP flow can replace the implementation without changing this contract.
   */
  signIn: (token: string) => SignInResult;
  /** Clears the session and stored token. */
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);

/** Accesses the auth session. Throws if used outside an <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
