import type { HandlerDataHistory } from '@sentry/types';
import { addHandler, fill, maybeInstrument, supportsHistory, triggerHandlers } from '@sentry/utils';
import { WINDOW } from '../metrics/types';

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

function instrumentHistory(): void {
  if (!supportsHistory()) {
    return;
  }

  const oldOnPopState = WINDOW.onpopstate;
  WINDOW.onpopstate = function (this: WindowEventHandlers, ...args: unknown[]) {
    const to = WINDOW.location.href;
    // keep track of the current URL state, as we always receive only the updated state
    const from = lastHref;
    lastHref = to;
    const handlerData: HandlerDataHistory = { from, to };
    triggerHandlers('history', handlerData);
    if (oldOnPopState) {
      // Apparently this can throw in Firefox when incorrectly implemented plugin is installed.
      // https://github.com/getsentry/sentry-javascript/issues/3344
      // https://github.com/bugsnag/bugsnag-js/issues/469
      try {
        return oldOnPopState.apply(this, args);
      } catch (_oO) {
        // no-empty
      }
    }
  };

  function historyReplacementFunction(originalHistoryFunction: () => void): () => void {
    return function (this: History, ...args: unknown[]): void {
      const url = args.length > 2 ? args[2] : undefined;
      if (url) {
        // coerce to string (this is what pushState does)
        const from = lastHref;
        const to = String(url);
        // keep track of the current URL state, as we always receive only the updated state
        lastHref = to;
        const handlerData: HandlerDataHistory = { from, to };
        triggerHandlers('history', handlerData);
      }
      return originalHistoryFunction.apply(this, args);
    };
  }

  fill(WINDOW.history, 'pushState', historyReplacementFunction);
  fill(WINDOW.history, 'replaceState', historyReplacementFunction);
}
