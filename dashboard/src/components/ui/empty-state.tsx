import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** Heading, e.g. "No data in range". Defaults to "Nothing to show". */
  title?: string;
  /** Optional supporting line explaining why it's empty / what to try next. */
  description?: string;
  /** Icon shown above the title. Defaults to an inbox glyph. */
  icon?: LucideIcon;
  /** Optional action (e.g. a "Clear filters" button) rendered below the text. */
  action?: React.ReactNode;
  className?: string;
}

/** Neutral placeholder for views with no results in the current range/filters. */
export function EmptyState({
  title = 'Nothing to show',
  description,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center text-card-foreground',
        className,
      )}
    >
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && (
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
