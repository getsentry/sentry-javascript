import { Integration } from '@sentry/types';
import { Raven } from '../raven';
// @ts-ignore
import { TraceKit } from '../tracekit';

/** Global OnError handler */
export class OnError implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'OnError';
  /**
   * @inheritDoc
   */
  public handler(...args: any[]): void {
    Raven._handleOnErrorStackInfo.call(Raven, ...args);
  }
  /**
   * @inheritDoc
   */
  public install(): void {
    TraceKit.report.subscribe(this.handler.bind(this));
  }
}
