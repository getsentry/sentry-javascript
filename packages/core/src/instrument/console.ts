/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import type { ConsoleLevel, HandlerDataConsole } from '../types-hoist/instrument';
import { CONSOLE_LEVELS, originalConsoleMethods } from '../utils/debug-logger';
import { fill } from '../utils/object';
import { GLOBAL_OBJ } from '../utils/worldwide';
import { addHandler, maybeInstrument, triggerHandlers } from './handlers';

/**
 * Add an instrumentation handler for when a console.xxx method is called.
 * Returns a function to remove the handler.
 *
 * Use at your own risk, this might break without changelog notice, only used internally.
 * @hidden
 */
export function addConsoleInstrumentationHandler(handler: (data: HandlerDataConsole) => void): () => void {
  const type = 'console';
  const removeHandler = addHandler(type, handler);
  maybeInstrument(type, instrumentConsole);
  return removeHandler;
}

function instrumentConsole(): void {
  if (!('console' in GLOBAL_OBJ)) {
    return;
  }

  CONSOLE_LEVELS.forEach(function (level: ConsoleLevel): void {
    if (!(level in GLOBAL_OBJ.console)) {
      return;
    }

    fill(GLOBAL_OBJ.console, level, function (originalConsoleMethod: () => any): Function {
      originalConsoleMethods[level] = originalConsoleMethod;

      return function (...args: any[]): void {
        triggerHandlers('console', { args, level } as HandlerDataConsole);

        const log = originalConsoleMethods[level];
        log?.apply(GLOBAL_OBJ.console, args);
      };
    });
  });
}
