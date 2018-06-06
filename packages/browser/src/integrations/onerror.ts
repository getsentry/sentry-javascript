import { Integration } from '@sentry/types';
import { Raven } from '../raven';
// @ts-ignore
import { TraceKit } from './tracekit';

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
    // tslint:disable-next-line:no-unsafe-any
    Raven._handleOnErrorStackInfo.call(Raven, ...args);
  }
  /**
   * @inheritDoc
   */
  public install(): void {
    // tslint:disable-next-line:no-unsafe-any
    TraceKit.report.subscribe(this.handler.bind(this));
  }
  /**
   * @inheritDoc
   */
  public uninstall(): void {
    // tslint:disable-next-line:no-unsafe-any
    TraceKit.report.unsubscribe(this.handler.bind(this));
  }
}
