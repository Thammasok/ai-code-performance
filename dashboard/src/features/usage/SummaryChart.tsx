/**
 * Single-series bar chart of the usage summary. One measure at a time (cost or
 * total tokens) by group_key — a single series needs no legend (the heading names
 * it). Color is the validated categorical slot-1 blue, themed via CSS variables
 * so light/dark swap without JS. Per the data-viz method: pick the form (magnitude
 * → bars), one hue, direct axis labels, and a per-bar hover tooltip.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { UsageGroupBy, UsageSummaryRow } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatCurrency, formatInteger, groupByLabel } from './format';

/** Which measure the chart plots. */
export type ChartMetric = 'cost' | 'tokens';

interface ChartDatum {
  group_key: string;
  cost: number;
  tokens: number;
}

function toChartData(rows: UsageSummaryRow[]): ChartDatum[] {
  return rows.map((row) => ({
    group_key: row.group_key,
    cost: row.cost_estimate_usd,
    tokens: row.tokens_input + row.tokens_output,
  }));
}

const METRIC_LABEL: Record<ChartMetric, string> = {
  cost: 'Cost (USD)',
  tokens: 'Total tokens',
};

function formatMetric(metric: ChartMetric, value: number): string {
  return metric === 'cost' ? formatCurrency(value) : formatInteger(value);
}

/** Compact axis tick, e.g. `$1.2k` / `340k` / `1.5M`, to keep the Y axis narrow. */
function formatAxisTick(metric: ChartMetric, value: number): string {
  const abs = Math.abs(value);
  const prefix = metric === 'cost' ? '$' : '';
  if (abs >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefix}${(value / 1_000).toFixed(1)}k`;
  return `${prefix}${value}`;
}

interface TooltipDatumPayload {
  payload: ChartDatum;
}

interface UsageTooltipProps {
  active?: boolean;
  payload?: TooltipDatumPayload[];
  metric: ChartMetric;
}

/** Theme-aware tooltip showing the group key and the active measure. */
function UsageTooltip({ active, payload, metric }: UsageTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-md">
      <p className="font-medium">{datum.group_key}</p>
      <p className="text-muted-foreground">
        {METRIC_LABEL[metric]}:{' '}
        <span className="font-medium text-foreground tabular-nums">
          {formatMetric(metric, metric === 'cost' ? datum.cost : datum.tokens)}
        </span>
      </p>
    </div>
  );
}

const metricToggleBtn =
  'h-8 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export interface SummaryChartProps {
  rows: UsageSummaryRow[];
  groupBy: UsageGroupBy;
  metric: ChartMetric;
  onMetricChange: (metric: ChartMetric) => void;
}

export function SummaryChart({
  rows,
  groupBy,
  metric,
  onMetricChange,
}: SummaryChartProps) {
  const data = toChartData(rows);

  return (
    // The arbitrary-property utility defines the series hue in both themes; the
    // SVG marks below inherit it via `var(--chart-series-1)`.
    <div className="[--chart-series-1:#2a78d6] dark:[--chart-series-1:#3987e5]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">
          {METRIC_LABEL[metric]} by {groupByLabel(groupBy).toLowerCase()}
        </h2>
        <div
          role="group"
          aria-label="Chart measure"
          className="flex items-center gap-1 rounded-md border border-border p-0.5"
        >
          {(['cost', 'tokens'] as const).map((option) => {
            const selected = metric === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => onMetricChange(option)}
                className={cn(
                  metricToggleBtn,
                  selected
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {option === 'cost' ? 'Cost' : 'Tokens'}
              </button>
            );
          })}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border)"
            vertical={false}
          />
          <XAxis
            dataKey="group_key"
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border)' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border)' }}
            width={64}
            tickFormatter={(value: number) => formatAxisTick(metric, value)}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }}
            content={<UsageTooltip metric={metric} />}
          />
          <Bar
            dataKey={metric}
            name={METRIC_LABEL[metric]}
            fill="var(--chart-series-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={72}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
