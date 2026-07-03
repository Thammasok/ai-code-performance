/**
 * Data hook for GET /v1/usage/summary. Owns the async lifecycle (loading / error
 * / success + stale flag) and guards against out-of-order responses so the view
 * only ever renders the result of the latest query.
 *
 * The server scopes results by the caller's role; this hook does not attempt to
 * widen scope — it simply issues the query the filters describe and renders back
 * whatever the backend returns (a 403 surfaces as an error for the UI to explain).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  getApiClient,
  type SummaryResult,
  type UsageSummaryQuery,
} from '@/lib/api';

/** Discriminated async state for the summary request. */
export type UsageSummaryState =
  | { status: 'loading' }
  | { status: 'success'; result: SummaryResult }
  | { status: 'error'; error: unknown };

export interface UseUsageSummaryReturn {
  state: UsageSummaryState;
  /** Re-run the current query (used by retry / manual refresh). */
  refetch: () => void;
}

/**
 * Fetch the usage summary for `query`, re-running whenever the serialized query
 * (or the reload nonce from {@link UseUsageSummaryReturn.refetch}) changes.
 */
export function useUsageSummary(
  query: UsageSummaryQuery,
): UseUsageSummaryReturn {
  const [state, setState] = useState<UsageSummaryState>({ status: 'loading' });
  // Bumping this re-triggers the fetch effect without changing the query value.
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  // Serialize so the effect depends on the query's *value*, not its identity.
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    // Effect-scoped cancellation: only the latest run may commit state, so a
    // slow earlier response can never overwrite a newer one (or a stale view).
    let cancelled = false;
    setState({ status: 'loading' });

    const parsed = JSON.parse(queryKey) as UsageSummaryQuery;
    getApiClient()
      .getUsageSummary(parsed)
      .then((result) => {
        if (!cancelled) setState({ status: 'success', result });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', error });
      });

    return () => {
      cancelled = true;
    };
  }, [queryKey, nonce]);

  return { state, refetch };
}
