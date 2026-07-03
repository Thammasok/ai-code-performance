/**
 * Governance audit-log compliance view (T-006). Read-only change history for
 * platform_admin + auditor (the /audit route is already guarded by RequireRole).
 *
 * Loading → LoadingState, failure → visible ErrorState with retry (no silent
 * retry / no cache — the client throws ApiError, including 403), and an empty
 * result → EmptyState. There are no mutations from this view.
 */

import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import type { AuditLogQuery } from '@/lib/api';
import { DateRangeFilter } from '@/features/audit/DateRangeFilter';
import { AuditLogTable } from '@/features/audit/AuditLogTable';
import { useAuditLog } from '@/features/audit/useAuditLog';

export function AuditLog() {
  // Applied query drives the fetch; the filter form edits a draft until "Apply".
  const [query, setQuery] = useState<AuditLogQuery>({});
  const { state, refetch } = useAuditLog(query);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-muted-foreground">
          Governance change history. Expand a row to see the before→after diff.
        </p>
      </header>

      <DateRangeFilter
        value={query}
        onApply={setQuery}
        disabled={state.status === 'loading'}
      />

      {state.status === 'loading' && <LoadingState label="Loading audit log…" />}

      {state.status === 'error' && (
        <ErrorState
          title="Could not load the audit log"
          error={state.error}
          onRetry={refetch}
        />
      )}

      {state.status === 'success' &&
        (state.data.entries.length === 0 ? (
          <EmptyState
            title="No audit entries"
            description="No governance changes were recorded for the selected date range."
          />
        ) : (
          <AuditLogTable entries={state.data.entries} />
        ))}
    </section>
  );
}
