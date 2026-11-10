import { ObjectId } from 'mongodb';
import type { FilterRule } from '../../../../shared/types';

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Values a typed filter could mean. Filters arrive as text, but a MongoDB field can hold a
 * number, an ObjectId, a boolean or a date, and an equality match only finds the right type.
 */
export function candidateValues(text: string): unknown[] {
  const values: unknown[] = [text];
  const trimmed = text.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) values.push(Number(trimmed));
  if (/^[0-9a-f]{24}$/i.test(trimmed)) values.push(new ObjectId(trimmed));
  if (/^(true|false)$/i.test(trimmed)) values.push(trimmed.toLowerCase() === 'true');
  const date = isoDate(trimmed);
  if (date) values.push(date);
  return values;
}

function isoDate(text: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) return undefined;
  const date = new Date(text.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Value for a range comparison: a number or date when the text is one, else the text. */
function comparable(text: string): unknown {
  const trimmed = text.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return isoDate(trimmed) ?? text;
}

/**
 * Case-insensitive text match, like the SQL drivers' `::text ILIKE`: strings match directly
 * (and can use an index for prefixes), and numbers, ObjectIds and dates match on their text form.
 * Needs MongoDB 4.2 or newer.
 */
function textMatch(field: string, pattern: string): Record<string, unknown> {
  return {
    $or: [
      { [field]: { $regex: pattern, $options: 'i' } },
      {
        $expr: {
          $regexMatch: {
            input: { $convert: { input: `$${field}`, to: 'string', onError: '', onNull: '' } },
            regex: pattern,
            options: 'i',
          },
        },
      },
    ],
  };
}

const RANGE: Partial<Record<FilterRule['operator'], string>> = {
  GREATER_THAN: '$gt',
  GREATER_OR_EQUAL: '$gte',
  LESS_THAN: '$lt',
  LESS_OR_EQUAL: '$lte',
};

/** The table view's filter rules as a MongoDB query filter. */
export function buildMongoFilter(rules: FilterRule[], matchAny: boolean): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];
  for (const rule of rules) {
    const field = rule.column;
    const range = RANGE[rule.operator];
    if (range) {
      conditions.push({ [field]: { [range]: comparable(rule.value) } });
      continue;
    }
    switch (rule.operator) {
      case 'EQUALS':
        conditions.push({ [field]: { $in: candidateValues(rule.value) } });
        break;
      case 'NOT_EQUALS':
        conditions.push({ [field]: { $nin: candidateValues(rule.value) } });
        break;
      case 'CONTAINS':
        conditions.push(textMatch(field, escapeRegex(rule.value)));
        break;
      case 'STARTS_WITH':
        conditions.push(textMatch(field, `^${escapeRegex(rule.value)}`));
        break;
      case 'ENDS_WITH':
        conditions.push(textMatch(field, `${escapeRegex(rule.value)}$`));
        break;
      case 'IS_NULL':
        // Matches documents where the field is null or missing, which is what "empty" means here.
        conditions.push({ [field]: null });
        break;
      case 'IS_NOT_NULL':
        conditions.push({ [field]: { $ne: null } });
        break;
    }
  }
  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return matchAny ? { $or: conditions } : { $and: conditions };
}
