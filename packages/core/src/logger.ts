import { getGlobalObject } from '@sentry/utils/misc';

// TODO: Implement different loggers for different environments
const global = getGlobalObject() as Window;

/** JSDoc */
class Logger {
  /** JSDoc */
  private readonly console: Console;
  /** JSDoc */
  private disabled: boolean;

  /** JSDoc */
  public constructor() {
    this.console = global.console;
    this.disabled = true;
  }
  /** JSDoc */
  public disable(): void {
    this.disabled = true;
  }
  /** JSDoc */
  public enable(): void {
    this.disabled = false;
  }
  /** JSDoc */
  public log(message: any): void {
    if (this.disabled) {
      return;
    }
    this.console.log(`Sentry Logger [Log]: ${message}`); // tslint:disable-line:no-console
  }
  /** JSDoc */
  public warn(message: any): void {
    if (this.disabled) {
      return;
    }
    this.console.warn(`Sentry Logger [Warn]: ${message}`); // tslint:disable-line:no-console
  }
  /** JSDoc */
  public error(message: any): void {
    if (this.disabled) {
      return;
    }
    this.console.error(`Sentry Logger [Error]: ${message}`); // tslint:disable-line:no-console
  }
}

const logger = new Logger();

export { logger };
