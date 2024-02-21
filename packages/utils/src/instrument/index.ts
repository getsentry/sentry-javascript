// TODO(v8): Consider moving this file (or at least parts of it) into the browser package. The registered handlers are mostly non-generic and we risk leaking runtime specific code into generic packages.

import { resetInstrumentationHandlers } from './_handlers';
import { addConsoleInstrumentationHandler } from './console';
import { addClickKeypressInstrumentationHandler } from './dom';
import { addFetchInstrumentationHandler } from './fetch';
import { addGlobalErrorInstrumentationHandler } from './globalError';
import { addGlobalUnhandledRejectionInstrumentationHandler } from './globalUnhandledRejection';
import { addHistoryInstrumentationHandler } from './history';
import { SENTRY_XHR_DATA_KEY, addXhrInstrumentationHandler } from './xhr';

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
