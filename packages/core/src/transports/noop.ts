import { Event, Response, Transport } from '@sentry/types';
import { makePlatformResolvedPromise } from '@sentry/utils';

/** Noop transport */
export class NoopTransport implements Transport {
  /**
   * @inheritDoc
   */
  public sendEvent(_: Event): PromiseLike<Response> {
    return makePlatformResolvedPromise({
      reason: `NoopTransport: Event has been skipped because no Dsn is configured.`,
      status: 'skipped',
    });
  }

  /**
   * @inheritDoc
   */
  public close(_?: number): PromiseLike<boolean> {
    return makePlatformResolvedPromise(true);
  }
}
