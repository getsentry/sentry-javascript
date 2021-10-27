import { Hub } from '@sentry/hub';
import { EventProcessor, Integration } from '@sentry/types';
import { fill, loadModule, logger } from '@sentry/utils';
import { Socket } from 'socket.io';

import { SpanStatus } from '../../spanstatus';

/** Tracing integration for socket.io */
export class SocketIO implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Socket.IO';

  /**
   * @inheritDoc
   */
  public name: string = SocketIO.id;

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    const pkg = loadModule<Socket>('socket.io/dist/socket.js');

    if (!pkg) {
      logger.error(`${this.name} COULD NOT LOAD`);
      return;
    }

    fill(pkg, 'emit', function(orig: () => void) {
      console.log('HEEEE');
      return function(ev: string, ...args: any[]) {
        const scope = getCurrentHub().getScope();
        const parentSpan = scope?.getSpan();

        const span = parentSpan?.startChild({
          op: `${ev} send`,
          description: 'foobarbaz',
        });

        try {
          const result = orig.apply(ev, args);
          span?.setStatus(SpanStatus.Ok);
          return result;
        } catch (error) {
          span?.setStatus(SpanStatus.UnknownError);
          throw error;
        } finally {
          span?.finish();
        }
      };
    });
  }
}
