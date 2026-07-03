/**
 * Data hook for the governance audit log.
 *
 * Deliberately has NO cache and NO silent retry: the compliance view must fail
 * visibly (ADR-005 / T-006). The client throws `ApiError` on non-OK responses
 * (including 403); we surface that in `error` for a visible ErrorState.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiClient, type AuditLogQuery, type AuditLogResponse } from '@/lib/api';

/** Discriminated async state for the audit-log fetch. */
export type AuditLogState =
  | { status: 'loading' }
  | { status: 'success'; data: AuditLogResponse }
  | { status: 'error'; error: unknown };

export interface UseAuditLogResult {
  state: AuditLogState;
  /** Re-run the fetch with the current query (used by the ErrorState retry). */
  refetch: () => void;
}

/**
 * Fetch the audit log for `query`, re-fetching whenever the query changes. A
 * monotonically increasing request id guards against out-of-order responses so
 * a slow earlier request can never overwrite a newer one.
 */
export function useAuditLog(query: AuditLogQuery): UseAuditLogResult {
  const [state, setState] = useState<AuditLogState>({ status: 'loading' });
  const requestIdRef = useRef(0);

  const { date_from, date_to } = query;

  const run = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setState({ status: 'loading' });

    getApiClient()
      .getGovernanceAuditLog({ date_from, date_to })
      .then((data) => {
        if (requestId === requestIdRef.current) {
          setState({ status: 'success', data });
        }
      })
      .catch((error: unknown) => {
        if (requestId === requestIdRef.current) {
          setState({ status: 'error', error });
        }
      });
  }, [date_from, date_to]);

  useEffect(() => {
    run();
    // Invalidate any in-flight request if the effect re-runs / unmounts.
    return () => {
      requestIdRef.current += 1;
    };
  }, [run]);

  return { state, refetch: run };
}
