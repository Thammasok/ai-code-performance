/**
 * Date-range filter for the audit log. Both bounds are optional; submitting
 * applies whatever is set. Values are ISO date strings ("YYYY-MM-DD") straight
 * from native date inputs, which is exactly what the API expects.
 */

import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import type { AuditLogQuery } from '@/lib/api';

export interface DateRangeFilterProps {
  /** Currently applied query, used to seed the inputs. */
  value: AuditLogQuery;
  /** Called with the new query when the user applies the filter. */
  onApply: (next: AuditLogQuery) => void;
  /** Disable inputs/buttons while a fetch is in flight. */
  disabled?: boolean;
}

/** Build a query, omitting empty bounds so we never send blank params. */
function toQuery(from: string, to: string): AuditLogQuery {
  const next: AuditLogQuery = {};
  if (from) next.date_from = from;
  if (to) next.date_to = to;
  return next;
}

export function DateRangeFilter({ value, onApply, disabled }: DateRangeFilterProps) {
  const fromId = useId();
  const toId = useId();
  const [from, setFrom] = useState(value.date_from ?? '');
  const [to, setTo] = useState(value.date_to ?? '');

  const isEmpty = from === '' && to === '';
  const isCleared = isEmpty && value.date_from == null && value.date_to == null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply(toQuery(from, to));
  }

  function handleClear() {
    setFrom('');
    setTo('');
    onApply({});
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={fromId} className="text-sm font-medium">
          From
        </label>
        <input
          id={fromId}
          type="date"
          value={from}
          max={to || undefined}
          disabled={disabled}
          onChange={(e) => setFrom(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={toId} className="text-sm font-medium">
          To
        </label>
        <input
          id={toId}
          type="date"
          value={to}
          min={from || undefined}
          disabled={disabled}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={disabled}>
          Apply
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={disabled || isCleared}
        >
          Clear
        </Button>
      </div>
    </form>
  );
}
