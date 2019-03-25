import { consoleSandbox, getGlobalObject } from './misc';

// TODO: Implement different loggers for different environments
const global = getGlobalObject<Window | NodeJS.Global>();

/** Prefix for logging strings */
const PREFIX = 'Sentry Logger ';

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
      global.console.log(`${PREFIX}[Log]: ${args.join(' ')}`); // tslint:disable-line:no-console
    });
  }

  /** JSDoc */
  public warn(...args: any[]): void {
    if (!this._enabled) {
      return;
    }
    consoleSandbox(() => {
      global.console.warn(`${PREFIX}[Warn]: ${args.join(' ')}`); // tslint:disable-line:no-console
    });
  }

  /** JSDoc */
  public error(...args: any[]): void {
    if (!this._enabled) {
      return;
    }
    consoleSandbox(() => {
      global.console.error(`${PREFIX}[Error]: ${args.join(' ')}`); // tslint:disable-line:no-console
    });
  }
}

// Ensure we only have a single logger instance, even if multiple versions of @sentry/utils are being used
global.__SENTRY__ = global.__SENTRY__ || {};
const logger = (global.__SENTRY__.logger as Logger) || (global.__SENTRY__.logger = new Logger());

export { logger };
