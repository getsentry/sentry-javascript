/* eslint-disable @typescript-eslint/no-explicit-any */
import { isDebugBuild } from './env';
import { getGlobalObject } from './global';

// TODO: Implement different loggers for different environments
const global = getGlobalObject<Window | NodeJS.Global>();

/** Prefix for logging strings */
const PREFIX = 'Sentry Logger ';

let _bypassConsoleInstrumentation = false;

/**
 * Returns true if the console should be bypassed.  This is used by the
 * captureconsole integration to disable itself.
 *
 * @returns true if the console instrumentation is bypassed.
 */
export function bypassConsoleInstrumentation(): boolean {
  return _bypassConsoleInstrumentation;
}

/**
 * Temporarily disable sentry console instrumentations.
 *
 * @param callback The function to run against the original `console` messages
 * @returns The results of the callback
 */
export function consoleSandbox(callback: () => any): any {
  const old = _bypassConsoleInstrumentation;
  _bypassConsoleInstrumentation = true;
  try {
    return callback();
  } finally {
    _bypassConsoleInstrumentation = old;
  }
}

function makeLogger(): Logger {
  let enabled = false;
  const logger: Logger = {
    enable: () => {
      enabled = !isDebugBuild();
    },
    disable: () => {
      enabled = false;
    },
  } as any;

  const methods = ['log', 'warn', 'error'];

  if (isDebugBuild()) {
    methods.forEach(name => {
      // @ts-ignore meh
      logger[name] = (...args: any[]) => {
        if (enabled) {
          consoleSandbox(() => {
            // @ts-ignore meh
            global.console[name](`${PREFIX}[${name}]:`, ...args);
          });
        }
      };
    });
  } else {
    methods.forEach(name => {
      // @ts-ignore meh
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      logger[name] = function() {};
    });
  }

  return logger;
}

/** JSDoc */
interface Logger {
  disable(): void;
  enable(): void;
  log(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
}

// Ensure we only have a single logger instance, even if multiple versions of @sentry/utils are being used
const sentry = (global.__SENTRY__ = global.__SENTRY__ || {});
const logger = (sentry.logger as Logger) || (sentry.logger = makeLogger());

export { logger };
