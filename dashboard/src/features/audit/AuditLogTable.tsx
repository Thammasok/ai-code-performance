/**
 * Read-only table of governance audit entries. Each row shows actor, action, and
 * timestamp; expanding a row reveals the before→after diff. Expansion is the only
 * interaction — there are no mutations from this view.
 */

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AuditLogEntry } from '@/lib/api';
import { formatTimestamp } from './format';
import { AuditLogDiff } from './AuditLogDiff';

export interface AuditLogTableProps {
  entries: AuditLogEntry[];
}

export function AuditLogTable({ entries }: AuditLogTableProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(index: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <caption className="sr-only">Governance change history</caption>
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="w-8 py-2 pl-3" aria-label="Expand row" />
            <th scope="col" className="px-3 py-2 font-medium">
              Actor
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Action
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              When
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => {
            const isOpen = expanded.has(index);
            const detailId = `audit-detail-${index}`;
            return (
              <Fragment key={index}>
                <tr
                  className={cn(
                    'border-t border-border',
                    isOpen && 'bg-muted/30',
                  )}
                >
                  <td className="py-2 pl-3 align-top">
                    <button
                      type="button"
                      onClick={() => toggle(index)}
                      aria-expanded={isOpen}
                      aria-controls={detailId}
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      )}
                      <span className="sr-only">
                        {isOpen ? 'Hide details' : 'Show details'} for {entry.action}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2 align-top font-medium text-foreground">
                    {entry.actor}
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-foreground">
                    {entry.action}
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap text-muted-foreground">
                    {formatTimestamp(entry.occurred_at)}
                  </td>
                </tr>
                {isOpen && (
                  <tr id={detailId} className="border-t border-border bg-muted/10">
                    <td className="py-3 pl-3 pr-3" colSpan={4}>
                      <AuditLogDiff before={entry.before} after={entry.after} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
