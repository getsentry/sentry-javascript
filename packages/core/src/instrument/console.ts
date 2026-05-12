/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { DEBUG_BUILD } from '../debug-build';
import type { ConsoleLevel, HandlerDataConsole } from '../types-hoist/instrument';
import { CONSOLE_LEVELS, originalConsoleMethods } from '../utils/debug-logger';
import { fill } from '../utils/object';
import { stringMatchesSomePattern } from '../utils/string';
import { GLOBAL_OBJ } from '../utils/worldwide';
import { addHandler, maybeInstrument, triggerHandlers } from './handlers';
import { debug } from '../utils/debug-logger';

/**
 * Filter out console messages that match the given strings or regular expressions.
 * These will neither be passed to the handler, and they will also not be logged to the user, unless they have debug enabled.
 * This is a set to avoid duplicate integration setups to add the same filter multiple times.
 */
const _filter = new Set<string | RegExp>([]);

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

/**
 * Add a filter to the console instrumentation to filter out console messages that match the given strings or regular expressions.
 * Returns a function to remove the filter.
 */
export function addConsoleInstrumentationFilter(filter: (string | RegExp)[]): () => void {
  for (const f of filter) {
    _filter.add(f);
  }

  return () => {
    for (const f of filter) {
      _filter.delete(f);
    }
  };
}

/** Only exported for tests. */
export function _INTERNAL_resetConsoleInstrumentationOptions(): void {
  _filter.clear();
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
        const firstArg = args[0];
        const log = originalConsoleMethods[level];

        const isFiltered = _filter.size && typeof firstArg === 'string' && stringMatchesSomePattern(firstArg, _filter);

        // Only trigger handlers for non-filtered messages
        if (!isFiltered) {
          triggerHandlers('console', { args, level } as HandlerDataConsole);
        }

        // Only log filtered messages in debug mode
        if (!isFiltered || (DEBUG_BUILD && debug.isEnabled())) {
          // Call original console method
          log?.apply(GLOBAL_OBJ.console, args);
        }
      };
    });
  });
}
