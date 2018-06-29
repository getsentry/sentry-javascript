import { Integration } from '@sentry/types';
import { makeErrorHandler } from '../handlers';

/** Global Promise Rejection handler */
export class OnUncaughtException implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'OnUncaughtException';
  /**
   * @inheritDoc
   */
  public readonly handler: (error: Error) => void = makeErrorHandler(
    // tslint:disable-next-line
    this.options.onFatalError,
  );
  /**
   * @inheritDoc
   */
  public constructor(
    private readonly options: {
      onFatalError?(firstError: Error, secondError?: Error): void;
    } = {},
  ) {}
  /**
   * @inheritDoc
   */
  public install(): void {
    global.process.on('uncaughtException', this.handler);
  }
}
