import { SyncPromise } from '@sentry/utils';

import { Event, Response, Status } from '../../../src';
import { BaseTransport } from '../../../src/transports';

export class SimpleTransport extends BaseTransport {
  public sendEvent(_: Event): PromiseLike<Response> {
    return this._buffer.add(() =>
      SyncPromise.resolve({
        status: Status.fromHttpCode(200),
      }),
    );
  }
}
