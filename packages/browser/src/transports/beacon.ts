import { Event, Response, Status } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils/misc';
import { BaseTransport } from './base';

const global = getGlobalObject() as Window;

/** `sendBeacon` based transport */
export class BeaconTransport extends BaseTransport {
  /**
   * @inheritDoc
   */
  public async sendEvent(event: Event): Promise<Response> {
    const result = global.navigator.sendBeacon(this.url, JSON.stringify(event));

    return this.buffer.add(
      Promise.resolve({
        status: result ? Status.Success : Status.Failed,
      }),
    );
  }
}
