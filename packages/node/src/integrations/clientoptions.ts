import { getCurrentHub, Scope } from '@sentry/hub';
import { Integration, SentryEvent } from '@sentry/types';
import { NodeOptions } from '../backend';

/** Apply Node specific options to event. For now, it's only `server_name`. */
export class ClientOptions implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'ClientOptions';

  /**
   * @inheritDoc
   */
  public install(options: NodeOptions = {}): void {
    getCurrentHub().configureScope((scope: Scope) => {
      scope.addEventProcessor(async (event: SentryEvent) => {
        const preparedEvent: SentryEvent = {
          ...event,
          platform: 'node',
        };

        if (options.serverName) {
          event.server_name = options.serverName;
        }

        return preparedEvent;
      });
    });
  }
}
