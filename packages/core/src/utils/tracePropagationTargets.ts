import { DEBUG_BUILD } from '../debug-build';
import type { CoreOptions as Options } from '../types-hoist/options';
import { debug } from './debug-logger';
import type { LRUMap } from './lru';
import { stringMatchesSomePattern } from './string';

const NOT_PROPAGATED_MESSAGE =
  '[Tracing] Not injecting trace data for url because it does not match tracePropagationTargets:';

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

  const decision = stringMatchesSomePattern(url, tracePropagationTargets);
  decisionMap?.set(url, decision);

  DEBUG_BUILD && !decision && debug.log(NOT_PROPAGATED_MESSAGE, url);
  return decision;
}
