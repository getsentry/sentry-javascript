import type { ConsoleLevel } from '@sentry/types';

import { DEBUG_BUILD } from './debug-build';
import { GLOBAL_OBJ } from './worldwide';

/** Prefix for logging strings */
const PREFIX = 'Sentry Logger ';

export const CONSOLE_LEVELS: readonly ConsoleLevel[] = [
  'debug',
  'info',
  'warn',
  'error',
  'log',
  'assert',
  'trace',
] as const;

type LoggerMethod = (...args: unknown[]) => void;
type LoggerConsoleMethods = Record<ConsoleLevel, LoggerMethod>;

/** This may be mutated by the console instrumentation. */
export const originalConsoleMethods: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key in ConsoleLevel]?: (...args: any[]) => void;
} = {};

/** JSDoc */
interface Logger extends LoggerConsoleMethods {
  disable(): void;
  enable(): void;
  isEnabled(): boolean;
}

/**
 * Temporarily disable sentry console instrumentations.
 *
 * @param callback The function to run against the original `console` messages
 * @returns The results of the callback
 */
export function consoleSandbox<T>(callback: () => T): T {
  if (!('console' in GLOBAL_OBJ)) {
    return callback();
  }

  const console = GLOBAL_OBJ.console as Console;
  const wrappedFuncs: Partial<LoggerConsoleMethods> = {};

  const wrappedLevels = Object.keys(originalConsoleMethods) as ConsoleLevel[];

  // Restore all wrapped console methods
  wrappedLevels.forEach(level => {
    const originalConsoleMethod = originalConsoleMethods[level] as LoggerMethod;
    wrappedFuncs[level] = console[level] as LoggerMethod | undefined;
    console[level] = originalConsoleMethod;
  });

  try {
    return callback();
  } finally {
    // Revert restoration to wrapped state
    wrappedLevels.forEach(level => {
      console[level] = wrappedFuncs[level] as LoggerMethod;
    });
  }
}

function makeLogger(): Logger {
  let enabled = false;
  const logger: Partial<Logger> = {
    enable: () => {
      enabled = true;
    },
    disable: () => {
      enabled = false;
    },
    isEnabled: () => enabled,
  };

  if (DEBUG_BUILD) {
    CONSOLE_LEVELS.forEach(name => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger[name] = (...args: any[]) => {
        if (enabled) {
          consoleSandbox(() => {
            GLOBAL_OBJ.console[name](`${PREFIX}[${name}]:`, ...args);
          });
        }
      };
    });
  } else {
    CONSOLE_LEVELS.forEach(name => {
      logger[name] = () => undefined;
    });
  }

  return logger as Logger;
}

export const logger = makeLogger();
