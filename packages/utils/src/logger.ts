/* eslint-disable @typescript-eslint/no-explicit-any */
import { WrappedFunction } from '@sentry/types';

import { getGlobalObject } from './global';

// TODO: Implement different loggers for different environments
const global = getGlobalObject<Window | NodeJS.Global>();

/** Prefix for logging strings */
const PREFIX = 'Sentry Logger ';

/** JSDoc */
interface ExtensibleConsole extends Console {
  [key: string]: any;
}

/**
 * Temporarily unwrap `console.log` and friends in order to perform the given callback using the original methods.
 * Restores wrapping after the callback completes.
 *
 * @param callback The function to run against the original `console` messages
 * @returns The results of the callback
 */
export function consoleSandbox(callback: () => any): any {
  const global = getGlobalObject<Window>();
  const levels = ['debug', 'info', 'warn', 'error', 'log', 'assert'];

  if (!('console' in global)) {
    return callback();
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const originalConsole = (global as any).console as ExtensibleConsole;
  const wrappedLevels: { [key: string]: any } = {};

  // Restore all wrapped console methods
  levels.forEach(level => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (level in (global as any).console && (originalConsole[level] as WrappedFunction).__sentry_original__) {
      wrappedLevels[level] = originalConsole[level] as WrappedFunction;
      originalConsole[level] = (originalConsole[level] as WrappedFunction).__sentry_original__;
    }
  });

  // Perform callback manipulations
  const result = callback();

  // Revert restoration to wrapped state
  Object.keys(wrappedLevels).forEach(level => {
    originalConsole[level] = wrappedLevels[level];
  });

  return result;
}

/** JSDoc */
class Logger {
  /** JSDoc */
  private _enabled: boolean;

  /** JSDoc */
  public constructor() {
    this._enabled = false;
  }

  /** JSDoc */
  public disable(): void {
    this._enabled = false;
  }

  /** JSDoc */
  public enable(): void {
    this._enabled = true;
  }

  /** JSDoc */
  public log(...args: any[]): void {
    if (!this._enabled) {
      return;
    }
    consoleSandbox(() => {
      global.console.log(`${PREFIX}[Log]: ${args.join(' ')}`);
    });
  }

  /** JSDoc */
  public warn(...args: any[]): void {
    if (!this._enabled) {
      return;
    }
    consoleSandbox(() => {
      global.console.warn(`${PREFIX}[Warn]: ${args.join(' ')}`);
    });
  }

  /** JSDoc */
  public error(...args: any[]): void {
    if (!this._enabled) {
      return;
    }
    consoleSandbox(() => {
      global.console.error(`${PREFIX}[Error]: ${args.join(' ')}`);
    });
  }
}

// Ensure we only have a single logger instance, even if multiple versions of @sentry/utils are being used
global.__SENTRY__ = global.__SENTRY__ || {};
const logger = (global.__SENTRY__.logger as Logger) || (global.__SENTRY__.logger = new Logger());

export { logger };
