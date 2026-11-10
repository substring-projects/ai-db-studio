import type { FilterOperator, FilterRule } from '../../shared/types';
import { describeEjson, isEjsonWrapper } from '../../shared/mongoShell.ts';

export type ColumnKind = 'number' | 'text' | 'boolean' | 'date' | 'json' | 'binary' | 'enum' | 'uuid' | 'array' | 'unknown';

/** Text form of a cell. The driver can return dates, JSON objects and bytes, not just primitives. */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? String(value) : value.toISOString();
  if (value instanceof Uint8Array) {
    const hex = Array.from(value.slice(0, 32), (b) => b.toString(16).padStart(2, '0')).join('');
    return `0x${hex}${value.length > 32 ? '…' : ''}`;
  }
  if (typeof value === 'object') {
    // MongoDB values arrive as Extended JSON wrappers such as { $oid: "…" }.
    const bson = describeEjson(value);
    return bson ?? JSON.stringify(value);
  }
  return String(value);
}

/**
 * The plain value behind a MongoDB Extended JSON wrapper: numbers for { $numberDecimal: "9.5" }
 * and friends, ISO text for { $date: … }. Anything else is returned as it is, so SQL values
 * are never touched.
 */
export function ejsonScalar(value: unknown): unknown {
  if (!isEjsonWrapper(value)) return value;
  const [key, inner] = Object.entries(value)[0] as [string, any];
  if (key === '$numberDecimal' || key === '$numberLong' || key === '$numberInt' || key === '$numberDouble') return Number(inner);
  if (key === '$date') return describeEjson(value);
  return value;
}

export function kindFromTypeName(typeName: string): ColumnKind {
  const t = typeName.toLowerCase();
  if (/tinyint\(1\)|bool|bit\b/.test(t)) return 'boolean';
  if (/int|numeric|decimal|real|double|float|money|serial/.test(t)) return 'number';
  if (/date|time|year/.test(t)) return 'date';
  if (/json/.test(t)) return 'json';
  if (/bytea|blob|binary/.test(t)) return 'binary';
  if (/enum/.test(t)) return 'enum';
  if (/uuid/.test(t)) return 'uuid';
  if (/\[\]|array/.test(t)) return 'array';
  return 'text';
}

/** Best guess from values, for query results where no column metadata exists. */
export function inferColumnKind(rows: unknown[][], index: number): ColumnKind {
  for (let i = 0; i < Math.min(rows.length, 50); i += 1) {
    const value = rows[i][index];
    if (value === null || value === undefined) continue;
    if (typeof value === 'number' || typeof value === 'bigint') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    if (value instanceof Uint8Array) return 'binary';
    if (Array.isArray(value)) return 'array';
    if (isEjsonWrapper(value)) {
      const key = Object.keys(value)[0];
      if (key === '$date') return 'date';
      if (/^\$number/.test(key)) return 'number';
      return 'text';
    }
    if (typeof value === 'object') return 'json';
    const s = String(value);
    if (/^(true|false)$/i.test(s)) return 'boolean';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return 'uuid';
    if (/^-?\d+(\.\d+)?$/.test(s)) return 'number';
    if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(s)) return 'date';
    return 'text';
  }
  return 'unknown';
}

function compareRaw(rawA: unknown, rawB: unknown): number {
  const a = ejsonScalar(rawA);
  const b = ejsonScalar(rawB);
  const left = Number(a);
  const right = Number(b);
  if (a !== '' && b !== '' && !Number.isNaN(left) && !Number.isNaN(right) && typeof a !== 'object' && typeof b !== 'object') {
    return left - right;
  }
  return formatCell(a).localeCompare(formatCell(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** Ascending comparison with NULLs last, the order people expect when scanning a column. */
export function compareCells(a: unknown, b: unknown): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull || bNull) return aNull === bNull ? 0 : aNull ? 1 : -1;
  return compareRaw(a, b);
}

/** Client-side counterpart of the server's filter rules, for ad-hoc query results. */
export function matchesRule(value: unknown, rule: FilterRule): boolean {
  const isNull = value === null || value === undefined;
  if (rule.operator === 'IS_NULL') return isNull;
  if (rule.operator === 'IS_NOT_NULL') return !isNull;
  if (isNull) return false;

  const text = formatCell(value).toLowerCase();
  const target = rule.value.toLowerCase();
  switch (rule.operator) {
    case 'CONTAINS':
      return text.includes(target);
    case 'STARTS_WITH':
      return text.startsWith(target);
    case 'ENDS_WITH':
      return text.endsWith(target);
    case 'EQUALS':
      return compareRaw(value, rule.value) === 0;
    case 'NOT_EQUALS':
      return compareRaw(value, rule.value) !== 0;
    case 'GREATER_THAN':
      return compareRaw(value, rule.value) > 0;
    case 'GREATER_OR_EQUAL':
      return compareRaw(value, rule.value) >= 0;
    case 'LESS_THAN':
      return compareRaw(value, rule.value) < 0;
    case 'LESS_OR_EQUAL':
      return compareRaw(value, rule.value) <= 0;
    default:
      return true;
  }
}

export const FILTER_OPERATORS: { label: string; value: FilterOperator; needsValue: boolean }[] = [
  { label: 'contains', value: 'CONTAINS', needsValue: true },
  { label: 'equals', value: 'EQUALS', needsValue: true },
  { label: 'not equals', value: 'NOT_EQUALS', needsValue: true },
  { label: 'starts with', value: 'STARTS_WITH', needsValue: true },
  { label: 'ends with', value: 'ENDS_WITH', needsValue: true },
  { label: '>', value: 'GREATER_THAN', needsValue: true },
  { label: '≥', value: 'GREATER_OR_EQUAL', needsValue: true },
  { label: '<', value: 'LESS_THAN', needsValue: true },
  { label: '≤', value: 'LESS_OR_EQUAL', needsValue: true },
  { label: 'is null', value: 'IS_NULL', needsValue: false },
  { label: 'is not null', value: 'IS_NOT_NULL', needsValue: false },
];

const delimited = (value: unknown, delimiter: string): string => {
  if (value === null || value === undefined) return '';
  const text = formatCell(value);
  return /["\n\r]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toDelimited(columns: string[], rows: unknown[][], delimiter = ',', includeHeader = true): string {
  const body = rows.map((row) => row.map((v) => delimited(v, delimiter)).join(delimiter));
  return (includeHeader ? [columns.map((c) => delimited(c, delimiter)).join(delimiter), ...body] : body).join('\n');
}

export function toJsonRecords(columns: string[], rows: unknown[][]): string {
  const records = rows.map((row) => {
    const record: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      const value = row[i];
      record[col] = value instanceof Uint8Array ? formatCell(value) : value;
    });
    return record;
  });
  return JSON.stringify(records, null, 2);
}

export function downloadText(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportResult(result: { columns: string[]; rows: unknown[][] }, baseName: string, format: 'csv' | 'json'): void {
  const safeName = baseName.replace(/[^\w.-]+/g, '-').slice(0, 60) || 'query-results';
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  if (format === 'csv') {
    downloadText(`${safeName}-${stamp}.csv`, toDelimited(result.columns, result.rows), 'text/csv');
  } else {
    downloadText(`${safeName}-${stamp}.json`, toJsonRecords(result.columns, result.rows), 'application/json');
  }
}
