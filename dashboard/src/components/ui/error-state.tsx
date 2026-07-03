import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Best-effort extraction of a human-readable message from an unknown error. */
function messageFromError(error: unknown): string | undefined {
  if (!error) return undefined;
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) {
    const { message } = error as { message?: unknown };
    if (typeof message === 'string') return message;
  }
  return undefined;
}

export interface ErrorStateProps {
  /** Heading for the error block. Defaults to "Something went wrong". */
  title?: string;
  /** Explicit message. Takes precedence over one derived from `error`. */
  message?: string;
  /** Raw error to derive a message from when `message` is not provided. */
  error?: unknown;
  /** When provided, renders a retry button that invokes this callback. */
  onRetry?: () => void;
  /** Label for the retry button. Defaults to "Try again". */
  retryLabel?: string;
  className?: string;
}

/**
 * Visible error block for data views that fail. Uses `role="alert"` so the
 * failure is announced immediately — governance and audit views rely on this to
 * surface errors rather than failing silently.
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  error,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  const resolved = message ?? messageFromError(error);

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-10 text-center',
        className,
      )}
    >
      <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {resolved && (
          <p className="max-w-md text-sm text-muted-foreground">{resolved}</p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
