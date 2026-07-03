/**
 * Usage & cost summary — the dashboard home ("/"). Renders a filter bar (date
 * range + group_by), then a bar chart and a data table of the results the backend
 * returns for the caller's role. Filters persist to localStorage and restore on
 * reload; scope is enforced server-side (we never try to widen it).
 */

import { useEffect, useMemo, useState } from 'react';
import { isApiError, type UsageSummaryQuery } from '@/lib/api';
import { useAuth } from '@/lib/auth/auth-context';
import type { Role } from '@/lib/auth/auth-context';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StaleBanner,
} from '@/components/ui';
import {
  loadPreference,
  savePreference,
  type DashboardUserPreference,
} from '@/features/usage/preferences';
import { SummaryFilters } from '@/features/usage/SummaryFilters';
import {
  SummaryChart,
  type ChartMetric,
} from '@/features/usage/SummaryChart';
import { SummaryTable } from '@/features/usage/SummaryTable';
import { useUsageSummary } from '@/features/usage/useUsageSummary';

/** One-line description of what data the signed-in role is scoped to see. */
const SCOPE_HINT: Record<Role, string> = {
  developer: 'Showing your own usage.',
  auditor: 'Showing your own usage.',
  manager: "Showing your team's usage.",
  platform_admin: 'Showing usage across all developers.',
};

/** Map an unknown fetch error to ErrorState props, with a clear 403 case. */
function errorStateProps(error: unknown): { title: string; message?: string } {
  if (isApiError(error)) {
    switch (error.kind) {
      case 'authorization':
        return {
          title: 'Scope not permitted',
          message:
            'Your role does not allow viewing this data. Narrow the filters or contact an administrator.',
        };
      case 'auth':
        return {
          title: 'Session expired',
          message: 'Please sign in again to view usage data.',
        };
      case 'validation':
        return {
          title: 'Invalid filters',
          message: error.message,
        };
      case 'rate_limit':
        return {
          title: 'Too many requests',
          message: 'Please wait a moment and try again.',
        };
      default:
        return { title: 'Could not load usage', message: error.message };
    }
  }
  return { title: 'Could not load usage' };
}

export function DashboardHome() {
  const { user } = useAuth();

  // Restore persisted filters once, on mount.
  const [prefs, setPrefs] = useState<DashboardUserPreference>(loadPreference);
  const [metric, setMetric] = useState<ChartMetric>('cost');

  // Persist filter selections whenever they change (client-side only).
  useEffect(() => {
    savePreference(prefs);
  }, [prefs]);

  // Filters drive the API query. Memoized so the fetch hook only re-runs when a
  // filter actually changes.
  const query = useMemo<UsageSummaryQuery>(
    () => ({
      date_from: prefs.date_from,
      date_to: prefs.date_to,
      group_by: prefs.group_by,
    }),
    [prefs.date_from, prefs.date_to, prefs.group_by],
  );

  const { state, refetch } = useUsageSummary(query);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Usage &amp; cost</h1>
        <p className="text-sm text-muted-foreground">
          {user ? SCOPE_HINT[user.role] : 'Aggregated AI CLI usage.'}
        </p>
      </header>

      <SummaryFilters
        value={prefs}
        onChange={setPrefs}
        disabled={state.status === 'loading'}
      />

      {state.status === 'loading' && <LoadingState label="Loading usage…" />}

      {state.status === 'error' && (
        <ErrorState {...errorStateProps(state.error)} onRetry={refetch} />
      )}

      {state.status === 'success' &&
        (state.result.data.results.length === 0 ? (
          <EmptyState
            title="No usage in this range"
            description="Try widening the date range or changing the grouping."
          />
        ) : (
          <div className="space-y-6">
            {state.result.stale && (
              <StaleBanner cachedAt={state.result.cachedAt} onRefresh={refetch} />
            )}

            <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
              <SummaryChart
                rows={state.result.data.results}
                groupBy={prefs.group_by}
                metric={metric}
                onMetricChange={setMetric}
              />
            </div>

            <SummaryTable
              rows={state.result.data.results}
              groupBy={prefs.group_by}
            />
          </div>
        ))}
    </section>
  );
}
