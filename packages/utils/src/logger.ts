import type { ConsoleLevel } from '@sentry/types';

import { GLOBAL_OBJ, getGlobalSingleton } from './worldwide';

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

class NoopLogger implements Logger {
  private _enabled: boolean;
  public constructor() {
    this._enabled = false;
  }

  public enable(): void {
    this._enabled = true;
  }

  public disable(): void {
    this._enabled = false;
  }

  public isEnabled(): boolean {
    return this._enabled;
  }

  /* eslint-disable @typescript-eslint/no-empty-function */
  public debug(): void {}
  public info(): void {}
  public warn(): void {}
  public error(): void {}
  public log(): void {}
  public assert(): void {}
  public trace(): void {}
  /* eslint-enable @typescript-eslint/no-empty-function */
}

/**
 * Enable the logger, and ensure it does not noop but actually logs messages out.
 */
export function enableLogger(): void {
  logger.enable();

  CONSOLE_LEVELS.forEach(name => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger[name] = (...args: any[]) => {
      if (logger.isEnabled()) {
        consoleSandbox(() => {
          GLOBAL_OBJ.console[name](`${PREFIX}[${name}]:`, ...args);
        });
      }
    };
  });
}

function makeLogger(): Logger {
  return new NoopLogger();
}

/**
 * This is a logger singleton which either logs things or no-ops if logging is not enabled.
 * The logger is a singleton on the carrier, to ensure that a consistent logger is used throughout the SDK.
 */
export const logger = getGlobalSingleton('logger', makeLogger);
