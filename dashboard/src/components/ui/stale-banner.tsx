import { History, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Format a timestamp as a short, locale-aware "as of" label; falls back gracefully. */
function formatAsOf(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export interface StaleBannerProps {
  /** When the served data was cached (ISO string, epoch ms, or Date). */
  cachedAt: string | number | Date;
  /** Leading message before the "as of" time. Defaults to a cache notice. */
  message?: string;
  /** When provided, renders a refresh button that invokes this callback. */
  onRefresh?: () => void;
  className?: string;
}

/**
 * Compact banner indicating the view is showing cached data because the live
 * request failed. Rendered by the summary view when the API client returns a
 * stale cached response.
 */
export function StaleBanner({
  cachedAt,
  message = 'Showing cached data — live request failed.',
  onRefresh,
  className,
}: StaleBannerProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground',
        className,
      )}
    >
      <History className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <span>{message}</span>
      <span className="text-muted-foreground">as of {formatAsOf(cachedAt)}</span>
      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="ml-auto h-7 px-2"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </Button>
      )}
    </div>
  );
}
