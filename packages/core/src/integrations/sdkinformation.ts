import { configureScope } from '@sentry/minimal';
import { Integration, SentryEvent } from '@sentry/types';

/** Adds SDK info to an event. */
export class SDKInformation implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'SDKInformation';

  /**
   * @inheritDoc
   */
  public constructor(
    private readonly config: {
      name: string;
      sdkName: string;
      sdkVersion: string;
    },
  ) {}

  /**
   * @inheritDoc
   */
  public install(): void {
    configureScope(scope => {
      scope.addEventProcessor(async (event: SentryEvent) => ({
        ...event,
        sdk: {
          name: this.config.sdkName,
          packages: [
            ...((event.sdk && event.sdk.packages) || []),
            {
              name: this.config.name,
              version: this.config.sdkVersion,
            },
          ],
          version: this.config.sdkVersion,
        },
      }));
    });
  }
}
