import { eventStatusFromHttpCode, makePlatformResolvedPromise } from '@sentry/utils';

import { Event, Response } from '../../../src';
import { BaseTransport } from '../../../src/transports';

export class SimpleTransport extends BaseTransport {
  public sendEvent(_: Event): PromiseLike<Response> {
    return this._buffer.add(() =>
      makePlatformResolvedPromise({
        status: eventStatusFromHttpCode(200),
      }),
    );
  }
}
