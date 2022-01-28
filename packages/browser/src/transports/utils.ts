import { forget, getGlobalObject, isDebugBuild, isNativeFetch, logger, supportsFetch } from '@sentry/utils';

const global = getGlobalObject<Window>();
let cachedFetchImpl: FetchImpl;

export type FetchImpl = typeof fetch;

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
export function getNativeFetchImplementation(): FetchImpl {
  if (cachedFetchImpl) {
    return cachedFetchImpl;
  }

  /* eslint-disable @typescript-eslint/unbound-method */

  // Fast path to avoid DOM I/O
  if (isNativeFetch(global.fetch)) {
    return (cachedFetchImpl = global.fetch.bind(global));
  }

  const document = global.document;
  let fetchImpl = global.fetch;
  // eslint-disable-next-line deprecation/deprecation
  if (document && typeof document.createElement === `function`) {
    try {
      const sandbox = document.createElement('iframe');
      sandbox.hidden = true;
      document.head.appendChild(sandbox);
      const contentWindow = sandbox.contentWindow;
      if (contentWindow && contentWindow.fetch) {
        fetchImpl = contentWindow.fetch;
      }
      document.head.removeChild(sandbox);
    } catch (e) {
      if (isDebugBuild()) {
        logger.warn('Could not create sandbox iframe for pure fetch check, bailing to window.fetch: ', e);
      }
    }
  }

  return (cachedFetchImpl = fetchImpl.bind(global));
  /* eslint-enable @typescript-eslint/unbound-method */
}

/**
 * Sends sdk client report using sendBeacon or fetch as a fallback if available
 *
 * @param url report endpoint
 * @param body report payload
 */
export function sendReport(url: string, body: string): void {
  const isRealNavigator = Object.prototype.toString.call(global && global.navigator) === '[object Navigator]';
  const hasSendBeacon = isRealNavigator && typeof global.navigator.sendBeacon === 'function';

  if (hasSendBeacon) {
    // Prevent illegal invocations - https://xgwang.me/posts/you-may-not-know-beacon/#it-may-throw-error%2C-be-sure-to-catch
    const sendBeacon = global.navigator.sendBeacon.bind(global.navigator);
    return sendBeacon(url, body);
  }

  if (supportsFetch()) {
    const fetch = getNativeFetchImplementation();
    return forget(
      fetch(url, {
        body,
        method: 'POST',
        credentials: 'omit',
        keepalive: true,
      }),
    );
  }
}
