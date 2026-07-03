/**
 * Formatting helpers for the usage-summary view. Kept framework-free so they can
 * be unit-tested and reused by the chart, table, and tooltip alike.
 */

import type { UsageGroupBy } from '@/lib/api';

const currencyFmt = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFmt = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

/** USD currency, e.g. `$1,234.56`. Non-finite input renders as `$0.00`. */
export function formatCurrency(value: number): string {
  return currencyFmt.format(Number.isFinite(value) ? value : 0);
}

/** Grouped integer, e.g. `1,234,567`. Non-finite input renders as `0`. */
export function formatInteger(value: number): string {
  return integerFmt.format(Number.isFinite(value) ? value : 0);
}

/** Human label for a group_by dimension (used in headings and axis titles). */
export function groupByLabel(groupBy: UsageGroupBy): string {
  switch (groupBy) {
    case 'tool':
      return 'Tool';
    case 'model':
      return 'Model';
    case 'developer':
      return 'Developer';
    case 'day':
      return 'Day';
  }
}
