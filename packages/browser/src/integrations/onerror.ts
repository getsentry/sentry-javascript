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
  public handler: () => void = () => {
    // tslint:disable-next-line:no-unsafe-any
    Raven._handleOnErrorStackInfo.bind(Raven);
  };
  /**
   * @inheritDoc
   */
  public install: () => void = () => {
    // tslint:disable-next-line:no-unsafe-any
    TraceKit.report.subscribe(this.handler);
  };
  /**
   * @inheritDoc
   */
  public uninstall: () => void = () => {
    // tslint:disable-next-line:no-unsafe-any
    TraceKit.report.unsubscribe(this.handler);
  };
}
