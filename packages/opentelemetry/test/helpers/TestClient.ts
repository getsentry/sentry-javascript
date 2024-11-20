import { BaseClient, createTransport, getCurrentScope } from '@sentry/core';
import { resolvedSyncPromise } from '@sentry/core';
import type { Client, ClientOptions, Event, Options, SeverityLevel } from '@sentry/types';

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
            type: exception.name,
            value: exception.message,
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
  const client = new TestClient(getDefaultTestClientOptions(options));

  // The client is on the current scope, from where it generally is inherited
  getCurrentScope().setClient(client);
  client.init();
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
