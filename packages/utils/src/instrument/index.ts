// TODO(v8): Consider moving this file (or at least parts of it) into the browser package. The registered handlers are mostly non-generic and we risk leaking runtime specific code into generic packages.

import { DEBUG_BUILD } from '../debug-build';
import { logger } from './../logger';
import type {
  InstrumentHandlerCallback as _InstrumentHandlerCallback,
  InstrumentHandlerType as _InstrumentHandlerType,
} from './_handlers';
import { resetInstrumentationHandlers } from './_handlers';
import { addConsoleInstrumentationHandler } from './console';
import { addClickKeypressInstrumentationHandler } from './dom';
import { addFetchInstrumentationHandler } from './fetch';
import { addGlobalErrorInstrumentationHandler } from './globalError';
import { addGlobalUnhandledRejectionInstrumentationHandler } from './globalUnhandledRejection';
import { addHistoryInstrumentationHandler } from './history';
import { SENTRY_XHR_DATA_KEY, addXhrInstrumentationHandler } from './xhr';

/**
 * Add handler that will be called when given type of instrumentation triggers.
 * Use at your own risk, this might break without changelog notice, only used internally.
 * @hidden
 * @deprecated Use the proper function per instrumentation type instead!
 */
export function addInstrumentationHandler(type: _InstrumentHandlerType, callback: _InstrumentHandlerCallback): void {
  switch (type) {
    case 'console':
      return addConsoleInstrumentationHandler(callback);
    case 'dom':
      return addClickKeypressInstrumentationHandler(callback);
    case 'xhr':
      return addXhrInstrumentationHandler(callback);
    case 'fetch':
      return addFetchInstrumentationHandler(callback);
    case 'history':
      return addHistoryInstrumentationHandler(callback);
    case 'error':
      return addGlobalErrorInstrumentationHandler(callback);
    case 'unhandledrejection':
      return addGlobalUnhandledRejectionInstrumentationHandler(callback);
    default:
      DEBUG_BUILD && logger.warn('unknown instrumentation type:', type);
  }
}

/**
 * @deprecated Use the specific handler data types from @sentry/types instead, e.g. HandlerDataFetch, HandlerDataConsole, ...
 */
type InstrumentHandlerCallback = _InstrumentHandlerCallback;

/**
 * @deprecated Use the specific handler functions instead, e.g. addConsoleInstrumentationHandler, ...
 */
type InstrumentHandlerType = _InstrumentHandlerType;

// eslint-disable-next-line deprecation/deprecation
export type { InstrumentHandlerCallback, InstrumentHandlerType };

export {
  addConsoleInstrumentationHandler,
  addClickKeypressInstrumentationHandler,
  addXhrInstrumentationHandler,
  addFetchInstrumentationHandler,
  addHistoryInstrumentationHandler,
  addGlobalErrorInstrumentationHandler,
  addGlobalUnhandledRejectionInstrumentationHandler,
  SENTRY_XHR_DATA_KEY,
  // Only exported for tests
  resetInstrumentationHandlers,
};
