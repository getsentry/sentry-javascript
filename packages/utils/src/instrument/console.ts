/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ConsoleLevel, HandlerDataConsole } from '@sentry/types';

import { CONSOLE_LEVELS, originalConsoleMethods } from '../logger';
import { GLOBAL_OBJ } from '../worldwide';
import { addHandler, maybeInstrument, triggerHandlers } from './handlers';

/**
 * Add an instrumentation handler for when a console.xxx method is called.
 *
 * Use at your own risk, this might break without changelog notice, only used internally.
 * @hidden
 */
export function addConsoleInstrumentationHandler(handler: (data: HandlerDataConsole) => void): void {
  addHandler('console', handler);
  maybeInstrument('console', instrumentConsole);
}

function instrumentConsole(): void {
  if (!('console' in GLOBAL_OBJ)) {
    return;
  }

  CONSOLE_LEVELS.forEach((level: ConsoleLevel): void => {
    if (!(level in GLOBAL_OBJ.console)) {
      return;
    }

    originalConsoleMethods[level] = GLOBAL_OBJ.console[level];
    GLOBAL_OBJ.console[level] = new Proxy(GLOBAL_OBJ.console[level], {
      apply(target, thisArg, args): any {
        const handlerData: HandlerDataConsole = { args, level };
        triggerHandlers('console', handlerData);
        return target.apply(thisArg, args);
      },
    });
  });
}
