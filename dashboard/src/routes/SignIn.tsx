import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';

interface LocationState {
  from?: { pathname?: string };
}

/**
 * Dev sign-in screen. Accepts a self-signed JWT and establishes a local session
 * by decoding its claims. This is a stub for local/dev use — a real OIDC flow
 * would replace the form while keeping the same `useAuth().signIn` contract.
 */
export function SignIn() {
  const { isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as LocationState | null)?.from?.pathname ?? '/';

  // Already signed in — skip the form.
  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = signIn(token);
    if (result.ok) {
      setError(null);
      navigate(from, { replace: true });
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-border p-6">
        <div className="flex items-center gap-2 font-semibold">
          <Activity className="h-5 w-5" aria-hidden="true" />
          AI Usage — Sign in
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <label htmlFor="dev-token" className="text-sm font-medium">
              Developer JWT
            </label>
            <textarea
              id="dev-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              rows={5}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste a self-signed JWT (eyJ...)"
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-describedby={error ? 'signin-error' : undefined}
              aria-invalid={error ? true : undefined}
            />
            <p className="text-xs text-muted-foreground">
              Claims are decoded locally to display identity and gate
              navigation. The server verifies the signature and remains the
              authority for access.
            </p>
          </div>

          {error && (
            <p id="signin-error" role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
