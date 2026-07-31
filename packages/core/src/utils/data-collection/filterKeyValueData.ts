import type { CollectBehavior } from '../../types/datacollection';
import { FILTERED_VALUE as FILTERED, SENSITIVE_KEY_SNIPPETS } from './filtering-snippets';

function isSensitiveKey(lower: string, denySnippets: string[]): boolean {
  return denySnippets.some(snippet => lower.includes(snippet));
}

export function shouldFilterDataKey(key: string, behavior: CollectBehavior, additionalDenyTerms?: string[]): boolean {
  if (behavior === false) {
    return true;
  }

  const lowerKey = key.toLowerCase();
  const denySnippets =
    additionalDenyTerms != null ? [...SENSITIVE_KEY_SNIPPETS, ...additionalDenyTerms] : SENSITIVE_KEY_SNIPPETS;

  if (isSensitiveKey(lowerKey, denySnippets)) {
    return true;
  }

  if (behavior === true) {
    return false;
  }

  const terms = 'deny' in behavior ? behavior.deny : behavior.allow;
  const matchesConfiguredTerm = terms.some(term => lowerKey.includes(term.toLowerCase()));
  return 'deny' in behavior ? matchesConfiguredTerm : !matchesConfiguredTerm;
}

/**
 * Filters a key-value record according to a `CollectBehavior`.
 *
 * Key names are always preserved. Values are either kept, replaced with
 * `[Filtered]`, or the entire record is dropped (off mode).
 *
 * @param additionalDenyTerms - Additional sensitive snippets to check beyond the built-in denylist.
 */
export function filterKeyValueData<T>(
  data: Record<string, T>,
  behavior: CollectBehavior,
  additionalDenyTerms?: string[],
): Record<string, T | string> {
  if (behavior === false) {
    return {};
  }

  const result: Record<string, T | string> = {};
  for (const key of Object.keys(data)) {
    result[key] = shouldFilterDataKey(key, behavior, additionalDenyTerms) ? FILTERED : data[key]!;
  }
  return result;
}
