/**
 * Filter bar for the usage-summary view: a date range (from / to) and a group_by
 * dimension. Controlled — the parent owns the {@link DashboardUserPreference} and
 * persists it; this component only renders inputs and reports changes.
 */

import { useId } from 'react';
import type { UsageGroupBy } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { DashboardUserPreference } from './preferences';
import { groupByLabel } from './format';

const GROUP_BY_OPTIONS: UsageGroupBy[] = ['tool', 'model', 'developer', 'day'];

const controlClass =
  'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export interface SummaryFiltersProps {
  value: DashboardUserPreference;
  onChange: (next: DashboardUserPreference) => void;
  /** Disables inputs while a request is in flight. */
  disabled?: boolean;
}

export function SummaryFilters({
  value,
  onChange,
  disabled = false,
}: SummaryFiltersProps) {
  const fromId = useId();
  const toId = useId();
  const groupId = useId();

  // Guard the invariant date_from <= date_to at the input layer.
  const rangeInvalid = value.date_from > value.date_to;

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={fromId} className="text-sm font-medium text-foreground">
          From
        </label>
        <input
          id={fromId}
          type="date"
          className={controlClass}
          value={value.date_from}
          max={value.date_to}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, date_from: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={toId} className="text-sm font-medium text-foreground">
          To
        </label>
        <input
          id={toId}
          type="date"
          className={controlClass}
          value={value.date_to}
          min={value.date_from}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, date_to: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={groupId} className="text-sm font-medium text-foreground">
          Group by
        </label>
        <select
          id={groupId}
          className={cn(controlClass, 'pr-8')}
          value={value.group_by}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...value, group_by: e.target.value as UsageGroupBy })
          }
        >
          {GROUP_BY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {groupByLabel(option)}
            </option>
          ))}
        </select>
      </div>

      {rangeInvalid && (
        <p role="alert" className="text-sm text-destructive">
          "From" date must be on or before "To" date.
        </p>
      )}
    </div>
  );
}
