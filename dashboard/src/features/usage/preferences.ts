/**
 * Client-side persistence of the dashboard's summary filters. This is a pure UI
 * convenience (restore the user's last date range + grouping on reload) — it is
 * NOT server state and never widens data scope, which the backend enforces by role.
 */

import type { IsoDate, UsageGroupBy } from '@/lib/api';

/** The user's persisted filter selections for the usage-summary view. */
export interface DashboardUserPreference {
  date_from: IsoDate;
  date_to: IsoDate;
  group_by: UsageGroupBy;
}

/** localStorage key for {@link DashboardUserPreference}. */
export const SUMMARY_FILTERS_KEY = 'ai-usage-dashboard:summary-filters';

const GROUP_BY_VALUES: readonly UsageGroupBy[] = [
  'tool',
  'model',
  'developer',
  'day',
];

/** `YYYY-MM-DD` for a Date, in the local timezone. */
function toIsoDate(date: Date): IsoDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** True for a plausible `YYYY-MM-DD` string. */
function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isGroupBy(value: unknown): value is UsageGroupBy {
  return (
    typeof value === 'string' &&
    (GROUP_BY_VALUES as readonly string[]).includes(value)
  );
}

/** Default filters: last 30 days ending today, grouped by tool. */
export function defaultPreference(): DashboardUserPreference {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29); // inclusive 30-day window
  return {
    date_from: toIsoDate(from),
    date_to: toIsoDate(to),
    group_by: 'tool',
  };
}

/**
 * Read persisted filters, falling back to {@link defaultPreference} for any
 * missing/invalid field. Never throws — a corrupt or unavailable store yields
 * the defaults.
 */
export function loadPreference(): DashboardUserPreference {
  const fallback = defaultPreference();
  try {
    const raw = localStorage.getItem(SUMMARY_FILTERS_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    const record = parsed as Record<string, unknown>;
    return {
      date_from: isIsoDate(record.date_from)
        ? record.date_from
        : fallback.date_from,
      date_to: isIsoDate(record.date_to) ? record.date_to : fallback.date_to,
      group_by: isGroupBy(record.group_by)
        ? record.group_by
        : fallback.group_by,
    };
  } catch {
    return fallback;
  }
}

/** Persist filters. Silently no-ops if storage is unavailable (e.g. private mode). */
export function savePreference(pref: DashboardUserPreference): void {
  try {
    localStorage.setItem(SUMMARY_FILTERS_KEY, JSON.stringify(pref));
  } catch {
    /* ignore quota / unavailable storage */
  }
}
