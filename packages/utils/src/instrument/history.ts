// TODO(v8): Move everything in this file into the browser package. Nothing here is generic and we run risk of leaking browser types into non-browser packages.

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import type { HandlerDataHistory } from '@sentry/types';

import { fill } from '../object';
import { supportsHistory } from '../supports';
import { GLOBAL_OBJ } from '../worldwide';
import { addHandler, maybeInstrument, triggerHandlers } from './_handlers';

const WINDOW = GLOBAL_OBJ as unknown as Window;

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
  WINDOW.onpopstate = function (this: WindowEventHandlers, ...args: any[]): any {
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
    return function (this: History, ...args: any[]): void {
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
