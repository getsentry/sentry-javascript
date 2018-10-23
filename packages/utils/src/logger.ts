import { consoleSandbox, getGlobalObject } from './misc';

// TODO: Implement different loggers for different environments
const global = getGlobalObject() as Window;

/** JSDoc */
class Logger {
  /** JSDoc */
  private enabled: boolean;

  /** JSDoc */
  public constructor() {
    this.enabled = false;
  }

  /** JSDoc */
  public disable(): void {
    this.enabled = false;
  }

  /** JSDoc */
  public enable(): void {
    this.enabled = true;
  }

  /** JSDoc */
  public log(...args: any[]): void {
    if (!this.enabled) {
      return;
    }
    consoleSandbox(() => {
      global.console.log(`Sentry Logger [Log]: ${args.join(' ')}`); // tslint:disable-line:no-console
    });
  }

  /** JSDoc */
  public warn(...args: any[]): void {
    if (!this.enabled) {
      return;
    }
    consoleSandbox(() => {
      global.console.warn(`Sentry Logger [Warn]: ${args.join(' ')}`); // tslint:disable-line:no-console
    });
  }

  /** JSDoc */
  public error(...args: any[]): void {
    if (!this.enabled) {
      return;
    }
    consoleSandbox(() => {
      global.console.error(`Sentry Logger [Error]: ${args.join(' ')}`); // tslint:disable-line:no-console
    });
  }
}

const logger = new Logger();

export { logger };
