import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const SPINNER_SIZES = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
} as const;

export interface SpinnerProps {
  /** Diameter of the spinner. Defaults to `md`. */
  size?: keyof typeof SPINNER_SIZES;
  className?: string;
}

/** Bare animated spinner icon. Prefer {@link LoadingState} for full-block loading. */
export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <Loader2
      className={cn('animate-spin text-muted-foreground', SPINNER_SIZES[size], className)}
      aria-hidden="true"
    />
  );
}

export interface LoadingStateProps {
  /** Visible + accessible label announced to screen readers. Defaults to "Loading…". */
  label?: string;
  /** Spinner size. Defaults to `md`. */
  size?: SpinnerProps['size'];
  /** Hide the text label but keep it available to assistive tech. */
  hideLabel?: boolean;
  className?: string;
}

/**
 * Centered loading indicator for data views. Announces politely via `role="status"`
 * so screen-reader users learn the region is loading.
 */
export function LoadingState({
  label = 'Loading…',
  size = 'md',
  hideLabel = false,
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground',
        className,
      )}
    >
      <Spinner size={size} />
      {hideLabel ? <span className="sr-only">{label}</span> : <span>{label}</span>}
    </div>
  );
}
