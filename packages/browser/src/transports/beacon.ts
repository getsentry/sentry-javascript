import { SentryEvent, SentryResponse, Status } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils/misc';
import { serialize } from '@sentry/utils/object';
import { BaseTransport } from './base';

const global = getGlobalObject() as Window;

/** `sendBeacon` based transport */
export class BeaconTransport extends BaseTransport {
  /**
   * @inheritDoc
   */
  public async captureEvent(event: SentryEvent): Promise<SentryResponse> {
    const data = serialize(event);

    const result = global.navigator.sendBeacon(this.url, data);

    return {
      status: result ? Status.Success : Status.Failed,
    };
  }
}
