import type { HandlerDataUnhandledRejection } from '../types-hoist/instrument';
import { GLOBAL_OBJ } from '../utils/worldwide';
import { addHandler, maybeInstrument, triggerHandlers } from './handlers';

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

  // Note: The reason we are doing window.onunhandledrejection instead of window.addEventListener('unhandledrejection')
  // is that we are using this handler in the Loader Script, to handle buffered rejections consistently
  GLOBAL_OBJ.onunhandledrejection = function (e: unknown): boolean {
    const handlerData: HandlerDataUnhandledRejection = e;
    triggerHandlers('unhandledrejection', handlerData);

    if (_oldOnUnhandledRejectionHandler) {
      // eslint-disable-next-line prefer-rest-params
      return _oldOnUnhandledRejectionHandler.apply(this, arguments);
    }

    return true;
  };

  GLOBAL_OBJ.onunhandledrejection.__SENTRY_INSTRUMENTED__ = true;
}
