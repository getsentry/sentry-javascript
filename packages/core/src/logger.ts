import { getGlobalObject } from '@sentry/utils/misc';

// TODO: Implement different loggers for different environments
const global = getGlobalObject() as Window;

/** TODO */
class Logger {
  /** TODO */
  private readonly console: Console;
  /** TODO */
  private disabled: boolean;

  /** TODO */
  public constructor() {
    this.console = global.console;
    this.disabled = true;
  }
  /** TODO */
  public disable(): void {
    this.disabled = true;
  }
  /** TODO */
  public enable(): void {
    this.disabled = false;
  }
  /** TODO */
  public log(message: any): void {
    if (this.disabled) {
      return;
    }
    this.console.log(`Sentry Logger [Log]: ${message}`); // tslint:disable-line:no-console
  }
  /** TODO */
  public warn(message: any): void {
    if (this.disabled) {
      return;
    }
    this.console.warn(`Sentry Logger [Warn]: ${message}`); // tslint:disable-line:no-console
  }
  /** TODO */
  public error(message: any): void {
    if (this.disabled) {
      return;
    }
    this.console.error(`Sentry Logger [Error]: ${message}`); // tslint:disable-line:no-console
  }
}

const logger = new Logger();

export { logger };
