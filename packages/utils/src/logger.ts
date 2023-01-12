import type { WrappedFunction } from '@sentry/types';

import { getGlobalSingleton, GLOBAL_OBJ } from './worldwide';

/** Prefix for logging strings */
const PREFIX = 'Sentry Logger ';

export const CONSOLE_LEVELS = ['debug', 'info', 'warn', 'error', 'log', 'assert', 'trace'] as const;
export type ConsoleLevel = typeof CONSOLE_LEVELS[number];

type LoggerMethod = (...args: unknown[]) => void;
type LoggerConsoleMethods = Record<typeof CONSOLE_LEVELS[number], LoggerMethod>;

/** JSDoc */
interface Logger extends LoggerConsoleMethods {
  disable(): void;
  enable(): void;
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

  const originalConsole = GLOBAL_OBJ.console as Console & Record<string, unknown>;
  const wrappedLevels: Partial<LoggerConsoleMethods> = {};

  // Restore all wrapped console methods
  CONSOLE_LEVELS.forEach(level => {
    // TODO(v7): Remove this check as it's only needed for Node 6
    const originalWrappedFunc =
      originalConsole[level] && (originalConsole[level] as WrappedFunction).__sentry_original__;
    if (level in originalConsole && originalWrappedFunc) {
      wrappedLevels[level] = originalConsole[level] as LoggerConsoleMethods[typeof level];
      originalConsole[level] = originalWrappedFunc as Console[typeof level];
    }
  });

  try {
    return callback();
  } finally {
    // Revert restoration to wrapped state
    Object.keys(wrappedLevels).forEach(level => {
      originalConsole[level] = wrappedLevels[level as typeof CONSOLE_LEVELS[number]];
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
  };

  if (__DEBUG_BUILD__) {
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

// Ensure we only have a single logger instance, even if multiple versions of @sentry/utils are being used
let logger: Logger;
if (__DEBUG_BUILD__) {
  logger = getGlobalSingleton('logger', makeLogger);
} else {
  logger = makeLogger();
}

export { logger };
