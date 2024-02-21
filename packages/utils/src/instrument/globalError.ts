import type { HandlerDataError } from '@sentry/types';

import { GLOBAL_OBJ } from '../worldwide';
import { addHandler, maybeInstrument, triggerHandlers } from './_handlers';

let _oldOnErrorHandler: (typeof GLOBAL_OBJ)['onerror'] | null = null;

/**
 * Add an instrumentation handler for when an error is captured by the global error handler.
 *
 * Use at your own risk, this might break without changelog notice, only used internally.
 * @hidden
 */
export function addGlobalErrorInstrumentationHandler(handler: (data: HandlerDataError) => void): void {
  const type = 'error';
  addHandler(type, handler);
  maybeInstrument(type, instrumentError);
}

function instrumentError(): void {
  _oldOnErrorHandler = GLOBAL_OBJ.onerror;

  GLOBAL_OBJ.onerror = function (
    msg: string | object,
    url?: string,
    line?: number,
    column?: number,
    error?: Error,
  ): boolean {
    const handlerData: HandlerDataError = {
      column,
      error,
      line,
      msg,
      url,
    };
    triggerHandlers('error', handlerData);

    if (_oldOnErrorHandler && !_oldOnErrorHandler.__SENTRY_LOADER__) {
      // eslint-disable-next-line prefer-rest-params
      return _oldOnErrorHandler.apply(this, arguments);
    }

    return false;
  };

  GLOBAL_OBJ.onerror.__SENTRY_INSTRUMENTED__ = true;
}
