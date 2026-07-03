/**
 * Tabular view of the usage summary with a totals row. Numeric columns are
 * right-aligned with tabular figures so they line up; cost renders as USD and
 * token/call counts as grouped integers. This is also the accessible fallback
 * for the chart (the data-viz method requires a table view alongside the chart).
 */

import type { UsageGroupBy, UsageSummaryRow } from '@/lib/api';
import { formatCurrency, formatInteger, groupByLabel } from './format';

export interface SummaryTableProps {
  rows: UsageSummaryRow[];
  groupBy: UsageGroupBy;
}

interface Totals {
  tokens_input: number;
  tokens_output: number;
  cost_estimate_usd: number;
  call_count: number;
}

function computeTotals(rows: UsageSummaryRow[]): Totals {
  return rows.reduce<Totals>(
    (acc, row) => ({
      tokens_input: acc.tokens_input + row.tokens_input,
      tokens_output: acc.tokens_output + row.tokens_output,
      cost_estimate_usd: acc.cost_estimate_usd + row.cost_estimate_usd,
      call_count: acc.call_count + row.call_count,
    }),
    { tokens_input: 0, tokens_output: 0, cost_estimate_usd: 0, call_count: 0 },
  );
}

const th =
  'px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground';
const num = 'px-3 py-2 text-right tabular-nums';

export function SummaryTable({ rows, groupBy }: SummaryTableProps) {
  const totals = computeTotals(rows);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Usage summary grouped by {groupByLabel(groupBy).toLowerCase()}
        </caption>
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <th scope="col" className={`${th} text-left`}>
              {groupByLabel(groupBy)}
            </th>
            <th scope="col" className={`${th} text-right`}>
              Tokens in
            </th>
            <th scope="col" className={`${th} text-right`}>
              Tokens out
            </th>
            <th scope="col" className={`${th} text-right`}>
              Cost (USD)
            </th>
            <th scope="col" className={`${th} text-right`}>
              Calls
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${row.group_key}-${index}`}
              className="border-b border-border last:border-0 hover:bg-muted/30"
            >
              <td className="px-3 py-2 font-medium text-foreground">
                {row.group_key}
              </td>
              <td className={num}>{formatInteger(row.tokens_input)}</td>
              <td className={num}>{formatInteger(row.tokens_output)}</td>
              <td className={num}>{formatCurrency(row.cost_estimate_usd)}</td>
              <td className={num}>{formatInteger(row.call_count)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-border bg-muted/40 font-medium text-foreground">
          <tr>
            <th scope="row" className="px-3 py-2 text-left">
              Total
            </th>
            <td className={num}>{formatInteger(totals.tokens_input)}</td>
            <td className={num}>{formatInteger(totals.tokens_output)}</td>
            <td className={num}>{formatCurrency(totals.cost_estimate_usd)}</td>
            <td className={num}>{formatInteger(totals.call_count)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
