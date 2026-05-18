import type { CollectBehavior } from '../../types/datacollection';
import { FILTERED_VALUE as FILTERED, SENSITIVE_KEY_SNIPPETS } from './filtering-snippets';

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_SNIPPETS.some(snippet => lower.includes(snippet));
}

/**
 * Filters a key-value record according to a `CollectBehavior`.
 *
 * Key names are always preserved. Values are either kept, replaced with
 * `[Filtered]`, or the entire record is dropped (off mode).
 */
export function filterKeyValueData(data: Record<string, string>, behavior: CollectBehavior): Record<string, string> {
  if (behavior === false) {
    return {};
  }

  const result: Record<string, string> = {};

  if (behavior === true) {
    for (const key of Object.keys(data)) {
      result[key] = isSensitiveKey(key) ? FILTERED : data[key]!;
    }
    return result;
  }

  if ('deny' in behavior) {
    const lowerTerms = behavior.deny.map(t => t.toLowerCase());
    for (const key of Object.keys(data)) {
      const lower = key.toLowerCase();
      const isDenied = isSensitiveKey(key) || lowerTerms.some(term => lower.includes(term));
      result[key] = isDenied ? FILTERED : data[key]!;
    }
    return result;
  }

  // allowList mode
  const lowerTerms = behavior.allow.map(t => t.toLowerCase());
  for (const key of Object.keys(data)) {
    if (isSensitiveKey(key)) {
      result[key] = FILTERED;
    } else {
      const lower = key.toLowerCase();
      const isAllowed = lowerTerms.some(term => lower.includes(term));
      result[key] = isAllowed ? data[key]! : FILTERED;
    }
  }
  return result;
}
