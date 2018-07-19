import { getDefaultHub } from '@sentry/hub';
import { Integration, SentryEvent } from '@sentry/types';
import { SDK_VERSION } from '../client';

/** Adds SDK package info to an event. */
export class SDKPackage implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'SDKPackage';

  /**
   * @inheritDoc
   */
  public install(): void {
    getDefaultHub().addEventProcessor(async (event: SentryEvent) => {
      if (event.sdk) {
        event.sdk.packages = [
          ...(event.sdk.packages || []),
          {
            name: 'npm:@sentry/browser',
            version: SDK_VERSION,
          },
        ];
      }
      return event;
    });
  }
}
