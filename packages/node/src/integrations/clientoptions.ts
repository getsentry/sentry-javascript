import { getDefaultHub } from '@sentry/hub';
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
    if (options.serverName) {
      getDefaultHub().addEventProcessor(async (event: SentryEvent) => ({
        ...event,
        server_name: options.serverName,
      }));
    }
  }
}
