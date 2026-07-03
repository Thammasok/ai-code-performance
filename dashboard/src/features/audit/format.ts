/**
 * Formatting + diffing helpers for the governance audit-log view.
 *
 * Audit entries carry opaque `before`/`after` JSON snapshots. These helpers turn
 * them into a readable, key-level diff and format values/timestamps for display.
 */

import type { IsoTimestamp } from '@/lib/api';

/** Per-key status when comparing a `before` snapshot to an `after` snapshot. */
export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

/** One row of a computed before→after diff, keyed by property name. */
export interface DiffRow {
  key: string;
  before: unknown;
  after: unknown;
  /** Whether the key was added, removed, changed, or left untouched. */
  status: DiffStatus;
}

/**
 * Format an ISO-8601 timestamp for display. Falls back to the raw string when it
 * cannot be parsed, so we never hide data behind an "Invalid Date".
 */
export function formatTimestamp(value: IsoTimestamp): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Render an arbitrary JSON value as a compact, human-readable string. Primitives
 * are shown directly; objects/arrays are JSON-stringified.
 */
export function formatValue(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Structural equality good enough for JSON snapshots (order-sensitive). */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Compute a stable, key-level diff between two opaque snapshots. The union of
 * keys is sorted alphabetically so the diff order is deterministic across
 * renders and entries.
 */
export function computeDiff(
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
): DiffRow[] {
  const b = before ?? {};
  const a = after ?? {};
  const keys = Array.from(
    new Set([...Object.keys(b), ...Object.keys(a)]),
  ).sort();

  return keys.map((key): DiffRow => {
    const inBefore = Object.prototype.hasOwnProperty.call(b, key);
    const inAfter = Object.prototype.hasOwnProperty.call(a, key);
    const beforeVal = b[key];
    const afterVal = a[key];

    let status: DiffStatus;
    if (!inBefore && inAfter) status = 'added';
    else if (inBefore && !inAfter) status = 'removed';
    else if (!jsonEqual(beforeVal, afterVal)) status = 'changed';
    else status = 'unchanged';

    return { key, before: beforeVal, after: afterVal, status };
  });
}
