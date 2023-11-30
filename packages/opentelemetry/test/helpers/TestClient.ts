import { BaseClient, createTransport, initAndBind } from '@sentry/core';
import type { Client, ClientOptions, Event, Options, SeverityLevel } from '@sentry/types';
import { resolvedSyncPromise } from '@sentry/utils';

import { wrapClientClass } from '../../src/custom/client';
import type { OpenTelemetryClient } from '../../src/types';

class BaseTestClient extends BaseClient<ClientOptions> {
  public constructor(options: ClientOptions) {
    super(options);
  }

  public eventFromException(exception: any): PromiseLike<Event> {
    return resolvedSyncPromise({
      exception: {
        values: [
          {
            /* eslint-disable @typescript-eslint/no-unsafe-member-access */
            type: exception.name,
            value: exception.message,
            /* eslint-enable @typescript-eslint/no-unsafe-member-access */
          },
        ],
      },
    });
  }

  public eventFromMessage(message: string, level: SeverityLevel = 'info'): PromiseLike<Event> {
    return resolvedSyncPromise({ message, level });
  }
}

export const TestClient = wrapClientClass(BaseTestClient);

export type TestClientInterface = Client & OpenTelemetryClient;

export function init(options: Partial<Options> = {}): void {
  initAndBind(TestClient, getDefaultTestClientOptions(options));
}

export function getDefaultTestClientOptions(options: Partial<Options> = {}): ClientOptions {
  return {
    enableTracing: true,
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  } as ClientOptions;
}
