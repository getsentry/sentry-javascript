import type { CollectBehavior } from '../../types/datacollection';
import { FILTERED_VALUE as FILTERED, SENSITIVE_KEY_SNIPPETS } from './filtering-snippets';

function isSensitiveKey(lower: string, denySnippets: string[]): boolean {
  return denySnippets.some(snippet => lower.includes(snippet));
}

/**
 * Filters a key-value record according to a `CollectBehavior`.
 *
 * Key names are always preserved. Values are either kept, replaced with
 * `[Filtered]`, or the entire record is dropped (off mode).
 *
 * @param additionalDenyTerms - Additional sensitive snippets to check beyond the built-in denylist (e.g. cookie-specific terms).
 */
export function filterKeyValueData(
  data: Record<string, string>,
  behavior: CollectBehavior,
  additionalDenyTerms?: string[],
): Record<string, string> {
  if (behavior === false) {
    return {};
  }

  const denySnippets =
    additionalDenyTerms != null ? [...SENSITIVE_KEY_SNIPPETS, ...additionalDenyTerms] : SENSITIVE_KEY_SNIPPETS;
  const result: Record<string, string> = {};

  if (behavior === true) {
    for (const key of Object.keys(data)) {
      result[key] = isSensitiveKey(key.toLowerCase(), denySnippets) ? FILTERED : data[key]!;
    }
    return result;
  }

  if ('deny' in behavior) {
    const lowerTerms = behavior.deny.map(t => t.toLowerCase());
    for (const key of Object.keys(data)) {
      const lower = key.toLowerCase();
      const isDenied = isSensitiveKey(lower, denySnippets) || lowerTerms.some(term => lower.includes(term));
      result[key] = isDenied ? FILTERED : data[key]!;
    }
    return result;
  }

  // allowList mode
  const lowerTerms = behavior.allow.map(t => t.toLowerCase());
  for (const key of Object.keys(data)) {
    const lower = key.toLowerCase();
    if (isSensitiveKey(lower, denySnippets)) {
      result[key] = FILTERED;
    } else {
      const isAllowed = lowerTerms.some(term => lower.includes(term));
      result[key] = isAllowed ? data[key]! : FILTERED;
    }
  }
  return result;
}
