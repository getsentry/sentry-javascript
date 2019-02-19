import { Event, Response, Status, Transport } from '@sentry/types';

/** Noop transport */
export class NoopTransport implements Transport {
  /**
   * @inheritDoc
   */
  public async sendEvent(_: Event): Promise<Response> {
    return Promise.resolve({
      reason: `NoopTransport: Event has been skipped because no Dsn is configured.`,
      status: Status.Skipped,
    });
  }

  /**
   * @inheritDoc
   */
  public async close(_?: number): Promise<boolean> {
    return Promise.resolve(true);
  }
}
