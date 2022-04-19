import { eventStatusFromHttpCode, resolvedSyncPromise } from '@sentry/utils';

import { Event, Response } from '../../../src';
import { BaseTransport } from '../../../src/transports';

// @ts-ignore It's okay that we're not implementing the `_sendRequest()` method because we don't use it in our tests
export class SimpleTransport extends BaseTransport {
  public sendEvent(_: Event): PromiseLike<Response> {
    return this._buffer.add(() =>
      resolvedSyncPromise({
        status: eventStatusFromHttpCode(200),
      }),
    );
  }
}
