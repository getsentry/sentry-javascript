import type { HandlerDataHistory } from '@sentry/core';
import { addHandler, fill, maybeInstrument, supportsHistory, triggerHandlers } from '@sentry/core';
import { WINDOW } from '../types';

let lastHref: string | undefined;

/**
 * Add an instrumentation handler for when a fetch request happens.
 * The handler function is called once when the request starts and once when it ends,
 * which can be identified by checking if it has an `endTimestamp`.
 *
 * Use at your own risk, this might break without changelog notice, only used internally.
 * @hidden
 */
export function addHistoryInstrumentationHandler(handler: (data: HandlerDataHistory) => void): void {
  const type = 'history';
  addHandler(type, handler);
  maybeInstrument(type, instrumentHistory);
}

/**
 * Exported just for testing
 */
export function instrumentHistory(): void {
  // The `popstate` event may also be triggered on `pushState`, but it may not always reliably be emitted by the browser
  // Which is why we also monkey-patch methods below, in addition to this
  WINDOW.addEventListener('popstate', () => {
    const to = WINDOW.location.href;
    // keep track of the current URL state, as we always receive only the updated state
    const from = lastHref;
    lastHref = to;

    if (from === to) {
      return;
    }

    const handlerData = { from, to } satisfies HandlerDataHistory;
    triggerHandlers('history', handlerData);
  });

  // Just guard against this not being available, in weird environments
  if (!supportsHistory()) {
    return;
  }

  function historyReplacementFunction(originalHistoryFunction: () => void): () => void {
    return function (this: History, ...args: unknown[]): void {
      const url = args.length > 2 ? args[2] : undefined;
      if (url) {
        const from = lastHref;

        // Ensure the URL is absolute
        // this can be either a path, then it is relative to the current origin
        // or a full URL of the current origin - other origins are not allowed
        // See: https://developer.mozilla.org/en-US/docs/Web/API/History/pushState#url
        // coerce to string (this is what pushState does)
        const to = getAbsoluteUrl(String(url));

        // keep track of the current URL state, as we always receive only the updated state
        lastHref = to;

        if (from === to) {
          return originalHistoryFunction.apply(this, args);
        }

        const handlerData = { from, to } satisfies HandlerDataHistory;
        triggerHandlers('history', handlerData);
      }
      return originalHistoryFunction.apply(this, args);
    };
  }

  fill(WINDOW.history, 'pushState', historyReplacementFunction);
  fill(WINDOW.history, 'replaceState', historyReplacementFunction);
}

function getAbsoluteUrl(urlOrPath: string): string {
  try {
    const url = new URL(urlOrPath, WINDOW.location.origin);
    return url.toString();
  } catch {
    // fallback, just do nothing
    return urlOrPath;
  }
}
