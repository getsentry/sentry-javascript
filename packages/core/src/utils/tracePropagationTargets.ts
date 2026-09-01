import { DEBUG_BUILD } from '../debug-build';
import type { CoreOptions as Options } from '../types/options';
import type { TracePropagationTargets } from '../types/tracing';
import { debug } from './debug-logger';
import { isRegExp, isString } from './is';
import type { LRUMap } from './lru';

const NOT_PROPAGATED_MESSAGE =
  '[Tracing] Not injecting trace data for url because it does not match tracePropagationTargets:';

const NORMALIZED_REGEXP_CACHE = new WeakMap<RegExp, RegExp>();

/**
 * Returns an equivalent RegExp that ignores case and is safe to `test()` repeatedly.
 *
 * The `g` and `y` flags are dropped because they make `test()` stateful via `lastIndex`, which would make a target
 * match only every other request. Results are cached since targets are matched once per outgoing request.
 */
function normalizeRegExpTarget(pattern: RegExp): RegExp {
  const flags = `${pattern.flags.replace(/[gy]/g, '')}${pattern.ignoreCase ? '' : 'i'}`;
  if (flags === pattern.flags) {
    return pattern;
  }

  const cached = NORMALIZED_REGEXP_CACHE.get(pattern);
  if (cached) {
    return cached;
  }

  const normalizedPattern = new RegExp(pattern.source, flags);
  NORMALIZED_REGEXP_CACHE.set(pattern, normalizedPattern);
  return normalizedPattern;
}

/**
 * Check if a value matches any of the given `tracePropagationTargets`.
 *
 * The value is usually a URL, but it can be anything a propagation decision is made on, such as a
 * Cloudflare binding name. String targets match as a substring unless `requireExactStringMatch` is set.
 *
 * Matching is case-insensitive: URL normalization (e.g. `new URL()`) lower-cases the origin, so a target
 * written with the same casing as the request (`'myApi.com'`, `/^myApi\.com/`) would otherwise never match.
 */
export function matchesTracePropagationTargets(
  value: string,
  tracePropagationTargets: TracePropagationTargets,
  requireExactStringMatch: boolean = false,
): boolean {
  const lowerCaseValue = value.toLowerCase();

  for (const target of tracePropagationTargets) {
    if (isString(target)) {
      const lowerCaseTarget = target.toLowerCase();
      if (requireExactStringMatch ? lowerCaseValue === lowerCaseTarget : lowerCaseValue.includes(lowerCaseTarget)) {
        return true;
      }
    } else if (isRegExp(target) && normalizeRegExpTarget(target).test(value)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a given URL should be propagated to or not.
 * If no url is defined, or no trace propagation targets are defined, this will always return `true`.
 * You can also optionally provide a decision map, to cache decisions and avoid repeated regex lookups.
 */
export function shouldPropagateTraceForUrl(
  url: string | undefined,
  tracePropagationTargets: Options['tracePropagationTargets'],
  decisionMap?: LRUMap<string, boolean>,
): boolean {
  if (typeof url !== 'string' || !tracePropagationTargets) {
    return true;
  }

  const cachedDecision = decisionMap?.get(url);
  if (cachedDecision !== undefined) {
    DEBUG_BUILD && !cachedDecision && debug.log(NOT_PROPAGATED_MESSAGE, url);
    return cachedDecision;
  }

  const decision = matchesTracePropagationTargets(url, tracePropagationTargets);
  decisionMap?.set(url, decision);

  DEBUG_BUILD && !decision && debug.log(NOT_PROPAGATED_MESSAGE, url);
  return decision;
}
