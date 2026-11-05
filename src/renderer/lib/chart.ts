import type { QueryResult } from '../../shared/types';
import { inferColumnKind, formatCell } from './grid.ts';

export type ChartForm = 'stat' | 'bar' | 'line';

export interface ChartSeries {
  name: string;
  values: (number | null)[];
}

export interface ChartSpec {
  form: ChartForm;
  xLabel: string;
  categories: string[];
  /** Timestamps for a line chart's x positions. */
  times?: number[];
  series: ChartSeries[];
  /** Rows left out to keep the chart readable. The table still shows them all. */
  omitted: number;
}

const MAX_BARS = 24;
const MAX_POINTS = 400;
const MAX_SERIES = 4;
/** Series this far below the largest are unreadable on one shared axis, so they stay in the table. */
const MAGNITUDE_RANGE = 100;

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Picks the chart that fits the shape of a result, or null when a table says it better. */
export function chooseChart(result: QueryResult): ChartSpec | null {
  if (result.isCommand || result.rows.length === 0 || result.columns.length === 0) return null;

  const kinds = result.columns.map((_, i) => inferColumnKind(result.rows, i));
  const numeric = kinds.flatMap((kind, i) => (kind === 'number' ? [i] : []));
  if (numeric.length === 0) return null;

  // One row of one number is a headline figure, not a chart.
  if (result.rows.length === 1 && result.columns.length === 1) {
    const value = toNumber(result.rows[0][0]);
    return value === null
      ? null
      : {
          form: 'stat',
          xLabel: '',
          categories: [],
          series: [{ name: result.columns[0], values: [value] }],
          omitted: 0,
        };
  }

  const dateIndex = kinds.indexOf('date');
  const textIndex = kinds.indexOf('text');
  const xIndex = dateIndex >= 0 ? dateIndex : textIndex;
  if (xIndex < 0 || result.rows.length < 2) return null;

  // Identifiers are numeric but are labels, not measures.
  const measures = numeric.filter((i) => !/(^|_)id$/i.test(result.columns[i]));
  if (measures.length === 0) return null;

  const isLine = dateIndex >= 0 && result.rows.length >= 3;
  const limit = isLine ? MAX_POINTS : MAX_BARS;
  let rows = result.rows.slice(0, limit);
  const omitted = result.rows.length - rows.length;

  // A bar chart needs distinct labels, or its bars would read as different things.
  if (!isLine && new Set(rows.map((r) => formatCell(r[xIndex]))).size !== rows.length) return null;

  let times: number[] | undefined;
  if (isLine) {
    const withTime = rows.map((row) => ({ row, time: new Date(row[xIndex] as string).getTime() }));
    if (withTime.some((p) => Number.isNaN(p.time))) return null;
    withTime.sort((a, b) => a.time - b.time);
    rows = withTime.map((p) => p.row);
    times = withTime.map((p) => p.time);
  }

  const allSeries = measures.map((i) => ({
    name: result.columns[i],
    values: rows.map((row) => toNumber(row[i])),
  }));
  const peak = (s: ChartSeries) => Math.max(0, ...s.values.map((v) => Math.abs(v ?? 0)));
  const largest = Math.max(...allSeries.map(peak));
  const series = allSeries.filter((s) => peak(s) * MAGNITUDE_RANGE >= largest).slice(0, MAX_SERIES);
  if (series.length === 0 || largest === 0) return null;

  return {
    form: isLine ? 'line' : 'bar',
    xLabel: result.columns[xIndex],
    categories: rows.map((row) => formatCell(row[xIndex])),
    times,
    series,
    omitted,
  };
}

/** Round axis ticks that include zero. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const low = Math.min(0, min);
  const high = Math.max(0, max);
  const range = high - low || 1;
  const rough = range / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough;
  const ticks: number[] = [];
  for (let t = Math.floor(low / step) * step; t <= high + step * 0.999; t += step) {
    ticks.push(Number(t.toFixed(10)));
    if (t >= high) break;
  }
  return ticks;
}

const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const fullFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const formatAxis = (value: number, maxTick: number) =>
  Math.abs(maxTick) >= 10_000 ? compactFormat.format(value) : fullFormat.format(value);
export const formatValue = (value: number | null) => (value === null ? 'NULL' : fullFormat.format(value));
