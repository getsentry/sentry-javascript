import { getGlobalSingleton } from '../carrier';
import { DEBUG_BUILD } from '../debug-build';
import type { ConsoleLevel } from '../types-hoist/instrument';
import { GLOBAL_OBJ } from './worldwide';

export interface SentryDebugLogger {
  disable(): void;
  enable(): void;
  isEnabled(): boolean;
  log(...args: Parameters<typeof console.log>): void;
  warn(...args: Parameters<typeof console.warn>): void;
  error(...args: Parameters<typeof console.error>): void;
}

export const CONSOLE_LEVELS: readonly ConsoleLevel[] = [
  'debug',
  'info',
  'warn',
  'error',
  'log',
  'assert',
  'trace',
] as const;

/** Prefix for logging strings */
const PREFIX = 'Sentry Logger ';

/** This may be mutated by the console instrumentation. */
export const originalConsoleMethods: Partial<{
  log(...args: Parameters<typeof console.log>): void;
  info(...args: Parameters<typeof console.info>): void;
  warn(...args: Parameters<typeof console.warn>): void;
  error(...args: Parameters<typeof console.error>): void;
  debug(...args: Parameters<typeof console.debug>): void;
  assert(...args: Parameters<typeof console.assert>): void;
  trace(...args: Parameters<typeof console.trace>): void;
}> = {};

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

  const console = GLOBAL_OBJ.console;
  const wrappedFuncs: Partial<Record<ConsoleLevel, (...args: unknown[]) => void>> = {};

  const wrappedLevels = Object.keys(originalConsoleMethods) as ConsoleLevel[];

  // Restore all wrapped console methods
  wrappedLevels.forEach(level => {
    const originalConsoleMethod = originalConsoleMethods[level];
    wrappedFuncs[level] = console[level] as (...args: unknown[]) => void;
    console[level] = originalConsoleMethod as (...args: unknown[]) => void;
  });

  try {
    return callback();
  } finally {
    // Revert restoration to wrapped state
    wrappedLevels.forEach(level => {
      console[level] = wrappedFuncs[level] as (...args: unknown[]) => void;
    });
  }
}

function enable(): void {
  _getLoggerSettings().enabled = true;
}

function disable(): void {
  _getLoggerSettings().enabled = false;
}

function isEnabled(): boolean {
  return _getLoggerSettings().enabled;
}

function log(...args: Parameters<typeof console.log>): void {
  _maybeLog('log', ...args);
}

function info(...args: Parameters<typeof console.info>): void {
  _maybeLog('info', ...args);
}

function warn(...args: Parameters<typeof console.warn>): void {
  _maybeLog('warn', ...args);
}

function error(...args: Parameters<typeof console.error>): void {
  _maybeLog('error', ...args);
}

function _maybeLog(level: ConsoleLevel, ...args: Parameters<(typeof console)[typeof level]>): void {
  if (!DEBUG_BUILD) {
    return;
  }

  if (isEnabled()) {
    consoleSandbox(() => {
      GLOBAL_OBJ.console[level](`${PREFIX}[${level}]:`, ...args);
    });
  }
}

function _getLoggerSettings(): { enabled: boolean } {
  if (!DEBUG_BUILD) {
    return { enabled: false };
  }

  return getGlobalSingleton('loggerSettings', () => ({ enabled: false }));
}

/**
 * This is a logger singleton which either logs things or no-ops if logging is not enabled.
 */
export const debug = {
  /** Enable logging. */
  enable,
  /** Disable logging. */
  disable,
  /** Check if logging is enabled. */
  isEnabled,
  /** Log a message. */
  log,
  /** Log a warning. */
  warn,
  /** Log an error. */
  error,
} satisfies SentryDebugLogger;
