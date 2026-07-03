/**
 * Side-by-side before→after diff for a single audit entry. Renders a key-level
 * comparison so reviewers can see exactly what a governance change touched,
 * without having to eyeball raw JSON blobs.
 */

import { cn } from '@/lib/utils';
import { computeDiff, formatValue, type DiffStatus } from './format';

export interface AuditLogDiffProps {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

const STATUS_STYLES: Record<DiffStatus, string> = {
  added: 'text-emerald-700 dark:text-emerald-400',
  removed: 'text-destructive',
  changed: 'text-amber-700 dark:text-amber-400',
  unchanged: 'text-muted-foreground',
};

const STATUS_LABELS: Record<DiffStatus, string> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
  unchanged: 'Unchanged',
};

export function AuditLogDiff({ before, after }: AuditLogDiffProps) {
  const rows = computeDiff(before, after);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No snapshot recorded for this entry.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="py-1 pr-4 font-medium">
              Field
            </th>
            <th scope="col" className="py-1 pr-4 font-medium">
              Before
            </th>
            <th scope="col" className="py-1 pr-4 font-medium">
              After
            </th>
            <th scope="col" className="py-1 font-medium">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-border align-top">
              <td className="py-1.5 pr-4 font-mono font-medium text-foreground">
                {row.key}
              </td>
              <td className="py-1.5 pr-4">
                <pre className="whitespace-pre-wrap break-words font-mono text-muted-foreground">
                  {row.status === 'added' ? '—' : formatValue(row.before)}
                </pre>
              </td>
              <td className="py-1.5 pr-4">
                <pre className="whitespace-pre-wrap break-words font-mono text-foreground">
                  {row.status === 'removed' ? '—' : formatValue(row.after)}
                </pre>
              </td>
              <td className={cn('py-1.5 text-xs font-medium', STATUS_STYLES[row.status])}>
                {STATUS_LABELS[row.status]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
