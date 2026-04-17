/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import type { ConsoleLevel, HandlerDataConsole } from '../types-hoist/instrument';
import type { WrappedFunction } from '../types-hoist/wrappedfunction';
import { CONSOLE_LEVELS, originalConsoleMethods } from '../utils/debug-logger';
import { fill, markFunctionWrapped } from '../utils/object';
import { GLOBAL_OBJ } from '../utils/worldwide';
import { addHandler, maybeInstrument, triggerHandlers } from './handlers';

/**
 * Add an instrumentation handler for when a console.xxx method is called.
 *
 * Use at your own risk, this might break without changelog notice, only used internally.
 * @hidden
 */
export function addConsoleInstrumentationHandler(handler: (data: HandlerDataConsole) => void): void {
  const type = 'console';
  addHandler(type, handler);
  maybeInstrument(type, instrumentConsole);
}

function instrumentConsole(): void {
  if (!('console' in GLOBAL_OBJ)) {
    return;
  }

  CONSOLE_LEVELS.forEach(function (level: ConsoleLevel): void {
    if (!(level in GLOBAL_OBJ.console)) {
      return;
    }

    if (typeof process !== 'undefined' && !!process.env.LAMBDA_TASK_ROOT) {
      // The AWS Lambda runtime replaces console methods AFTER our patch, which overwrites them.
      patchWithDefineProperty(level);
    } else {
      patchWithFill(level);
    }
  });
}

function patchWithFill(level: ConsoleLevel): void {
  fill(GLOBAL_OBJ.console, level, function (originalConsoleMethod: () => any): Function {
    originalConsoleMethods[level] = originalConsoleMethod;

    return function (...args: any[]): void {
      triggerHandlers('console', { args, level } as HandlerDataConsole);

      const log = originalConsoleMethods[level];
      log?.apply(GLOBAL_OBJ.console, args);
    };
  });
}

function patchWithDefineProperty(level: ConsoleLevel): void {
  const nativeMethod = GLOBAL_OBJ.console[level] as (...args: unknown[]) => void;
  originalConsoleMethods[level] = nativeMethod;

  let consoleDelegate: Function = nativeMethod;
  let isExecuting = false;

  const wrapper = function (...args: any[]): void {
    if (isExecuting) {
      // Re-entrant call: a third party captured `wrapper` via the getter and calls it
      // from inside their replacement (e.g. `const prev = console.log; console.log = (...a) => { prev(...a); }`).
      // Calling `consoleDelegate` here would recurse, so fall back to the native method.
      nativeMethod.apply(GLOBAL_OBJ.console, args);
      return;
    }
    isExecuting = true;
    try {
      triggerHandlers('console', { args, level });
      consoleDelegate.apply(GLOBAL_OBJ.console, args);
    } finally {
      isExecuting = false;
    }
  };
  markFunctionWrapped(wrapper as unknown as WrappedFunction, nativeMethod as unknown as WrappedFunction);

  try {
    let current: any = wrapper;

    Object.defineProperty(GLOBAL_OBJ.console, level, {
      configurable: true,
      enumerable: true,
      get() {
        return current;
      },
      // When `console[level]` is set to a new value, we want to check if it's something not done by us but by e.g. the Lambda runtime.
      set(newValue) {
        if (
          typeof newValue === 'function' &&
          // Ignore if it's set to the wrapper (e.g. by our own patch or consoleSandbox), which would cause an infinite loop.
          newValue !== wrapper &&
          // Function is not one of our wrappers (which have __sentry_original__) and not the original (stored in originalConsoleMethods)
          newValue !== originalConsoleMethods[level] &&
          !(newValue as WrappedFunction).__sentry_original__
        ) {
          // Absorb newly "set" function as the consoleDelegate but keep our wrapper as the active method.
          consoleDelegate = newValue;
          current = wrapper;
        } else {
          // Accept as-is: consoleSandbox restoring, other Sentry wrappers, or non-functions
          current = newValue;
        }
      },
    });
  } catch {
    // In case defineProperty fails (e.g. in older browsers), fall back to fill-style patching
    patchWithFill(level);
  }
}
