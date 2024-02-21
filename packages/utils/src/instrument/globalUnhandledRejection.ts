/* eslint-disable @typescript-eslint/no-explicit-any */

import type { HandlerDataUnhandledRejection } from '@sentry/types';

import { GLOBAL_OBJ } from '../worldwide';
import { addHandler, maybeInstrument, triggerHandlers } from './_handlers';

let _oldOnUnhandledRejectionHandler: (typeof GLOBAL_OBJ)['onunhandledrejection'] | null = null;

/**
 * Add an instrumentation handler for when an unhandled promise rejection is captured.
 *
 * Use at your own risk, this might break without changelog notice, only used internally.
 * @hidden
 */
export function addGlobalUnhandledRejectionInstrumentationHandler(
  handler: (data: HandlerDataUnhandledRejection) => void,
): void {
  const type = 'unhandledrejection';
  addHandler(type, handler);
  maybeInstrument(type, instrumentUnhandledRejection);
}

function instrumentUnhandledRejection(): void {
  _oldOnUnhandledRejectionHandler = GLOBAL_OBJ.onunhandledrejection;

  GLOBAL_OBJ.onunhandledrejection = function (e: any): boolean {
    const handlerData: HandlerDataUnhandledRejection = e;
    triggerHandlers('unhandledrejection', handlerData);

    if (_oldOnUnhandledRejectionHandler && !_oldOnUnhandledRejectionHandler.__SENTRY_LOADER__) {
      // eslint-disable-next-line prefer-rest-params
      return _oldOnUnhandledRejectionHandler.apply(this, arguments);
    }

    return true;
  };

  GLOBAL_OBJ.onunhandledrejection.__SENTRY_INSTRUMENTED__ = true;
}
