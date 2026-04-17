/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import type { ConsoleLevel, HandlerDataConsole, WrappedFunction } from '@sentry/core';
import {
  CONSOLE_LEVELS,
  GLOBAL_OBJ,
  consoleIntegration as coreConsoleIntegration,
  defineIntegration,
  fill,
  markFunctionWrapped,
  maybeInstrument,
  originalConsoleMethods,
  triggerHandlers,
} from '@sentry/core';

interface ConsoleIntegrationOptions {
  levels: ConsoleLevel[];
}

/**
 * Node-specific console integration that captures breadcrumbs and handles
 * the AWS Lambda runtime replacing console methods after our patch.
 *
 * In Lambda, console methods are patched via `Object.defineProperty` so that
 * external replacements (by the Lambda runtime) are absorbed as the delegate
 * while our wrapper stays in place. Outside Lambda, this delegates entirely
 * to the core `consoleIntegration` which uses the simpler `fill`-based patch.
 */
export const consoleIntegration = defineIntegration((options: Partial<ConsoleIntegrationOptions> = {}) => {
  return {
    name: 'Console',
    setup(client) {
      if (process.env.LAMBDA_TASK_ROOT) {
        maybeInstrument('console', instrumentConsoleLambda);
      }

      // Delegate breadcrumb handling to the core console integration.
      const core = coreConsoleIntegration(options);
      core.setup?.(client);
    },
  };
});

function instrumentConsoleLambda(): void {
  if (!('console' in GLOBAL_OBJ)) {
    return;
  }

  CONSOLE_LEVELS.forEach(function (level: ConsoleLevel): void {
    if (!(level in GLOBAL_OBJ.console)) {
      return;
    }

    patchWithDefineProperty(level);
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
      triggerHandlers('console', { args, level } as HandlerDataConsole);
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
      set(newValue) {
        if (
          typeof newValue === 'function' &&
          newValue !== wrapper &&
          newValue !== originalConsoleMethods[level] &&
          !(newValue as WrappedFunction).__sentry_original__
        ) {
          consoleDelegate = newValue;
          current = wrapper;
        } else {
          current = newValue;
        }
      },
    });
  } catch {
    // Fall back to fill-based patching if defineProperty fails
    fill(GLOBAL_OBJ.console, level, function (originalConsoleMethod: () => any): Function {
      originalConsoleMethods[level] = originalConsoleMethod;

      return function (...args: any[]): void {
        triggerHandlers('console', { args, level } as HandlerDataConsole);

        const log = originalConsoleMethods[level];
        log?.apply(GLOBAL_OBJ.console, args);
      };
    });
  }
}
