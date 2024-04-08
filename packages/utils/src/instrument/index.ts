import { addConsoleInstrumentationHandler } from './console';
import { addFetchInstrumentationHandler } from './fetch';
import { addGlobalErrorInstrumentationHandler } from './globalError';
import { addGlobalUnhandledRejectionInstrumentationHandler } from './globalUnhandledRejection';
import { addHandler, maybeInstrument, resetInstrumentationHandlers, triggerHandlers } from './handlers';

export {
  addConsoleInstrumentationHandler,
  addFetchInstrumentationHandler,
  addGlobalErrorInstrumentationHandler,
  addGlobalUnhandledRejectionInstrumentationHandler,
  addHandler,
  maybeInstrument,
  triggerHandlers,
  // Only exported for tests
  resetInstrumentationHandlers,
};
