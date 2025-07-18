import { debug, isNativeFunction } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import { WINDOW } from './types';

/**
 * We generally want to use window.fetch / window.setTimeout.
 * However, in some cases this may be wrapped (e.g. by Zone.js for Angular),
 * so we try to get an unpatched version of this from a sandboxed iframe.
 */

interface CacheableImplementations {
  setTimeout: typeof WINDOW.setTimeout;
  fetch: typeof WINDOW.fetch;
}

const cachedImplementations: Partial<CacheableImplementations> = {};

/**
 * Get the native implementation of a browser function.
 *
 * This can be used to ensure we get an unwrapped version of a function, in cases where a wrapped function can lead to problems.
 *
 * The following methods can be retrieved:
 * - `setTimeout`: This can be wrapped by e.g. Angular, causing change detection to be triggered.
 * - `fetch`: This can be wrapped by e.g. ad-blockers, causing an infinite loop when a request is blocked.
 */
export function getNativeImplementation<T extends keyof CacheableImplementations>(
  name: T,
): CacheableImplementations[T] {
  const cached = cachedImplementations[name];
  if (cached) {
    return cached;
  }

  let impl = WINDOW[name] as CacheableImplementations[T];

  // Fast path to avoid DOM I/O
  if (isNativeFunction(impl)) {
    return (cachedImplementations[name] = impl.bind(WINDOW) as CacheableImplementations[T]);
  }

  const document = WINDOW.document;
  // eslint-disable-next-line deprecation/deprecation
  if (document && typeof document.createElement === 'function') {
    try {
      const sandbox = document.createElement('iframe');
      sandbox.hidden = true;
      document.head.appendChild(sandbox);
      const contentWindow = sandbox.contentWindow;
      if (contentWindow?.[name]) {
        impl = contentWindow[name] as CacheableImplementations[T];
      }
      document.head.removeChild(sandbox);
    } catch (e) {
      // Could not create sandbox iframe, just use window.xxx
      DEBUG_BUILD && debug.warn(`Could not create sandbox iframe for ${name} check, bailing to window.${name}: `, e);
    }
  }

  // Sanity check: This _should_ not happen, but if it does, we just skip caching...
  // This can happen e.g. in tests where fetch may not be available in the env, or similar.
  if (!impl) {
    return impl;
  }

  return (cachedImplementations[name] = impl.bind(WINDOW) as CacheableImplementations[T]);
}

/** Clear a cached implementation. */
export function clearCachedImplementation(name: keyof CacheableImplementations): void {
  cachedImplementations[name] = undefined;
}

/**
 * A special usecase for incorrectly wrapped Fetch APIs in conjunction with ad-blockers.
 * Whenever someone wraps the Fetch API and returns the wrong promise chain,
 * this chain becomes orphaned and there is no possible way to capture it's rejections
 * other than allowing it bubble up to this very handler. eg.
 *
 * const f = window.fetch;
 * window.fetch = function () {
 *   const p = f.apply(this, arguments);
 *
 *   p.then(function() {
 *     console.log('hi.');
 *   });
 *
 *   return p;
 * }
 *
 * `p.then(function () { ... })` is producing a completely separate promise chain,
 * however, what's returned is `p` - the result of original `fetch` call.
 *
 * This mean, that whenever we use the Fetch API to send our own requests, _and_
 * some ad-blocker blocks it, this orphaned chain will _always_ reject,
 * effectively causing another event to be captured.
 * This makes a whole process become an infinite loop, which we need to somehow
 * deal with, and break it in one way or another.
 *
 * To deal with this issue, we are making sure that we _always_ use the real
 * browser Fetch API, instead of relying on what `window.fetch` exposes.
 * The only downside to this would be missing our own requests as breadcrumbs,
 * but because we are already not doing this, it should be just fine.
 *
 * Possible failed fetch error messages per-browser:
 *
 * Chrome:  Failed to fetch
 * Edge:    Failed to Fetch
 * Firefox: NetworkError when attempting to fetch resource
 * Safari:  resource blocked by content blocker
 */
export function fetch(...rest: Parameters<typeof WINDOW.fetch>): ReturnType<typeof WINDOW.fetch> {
  return getNativeImplementation('fetch')(...rest);
}

/**
 * Get an unwrapped `setTimeout` method.
 * This ensures that even if e.g. Angular wraps `setTimeout`, we get the native implementation,
 * avoiding triggering change detection.
 */
export function setTimeout(...rest: Parameters<typeof WINDOW.setTimeout>): ReturnType<typeof WINDOW.setTimeout> {
  return getNativeImplementation('setTimeout')(...rest);
}
