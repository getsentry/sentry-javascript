import type { ClientOptions, Event, Options, SeverityLevel } from '@sentry/core';
import { Client, createTransport, getCurrentScope, resolvedSyncPromise } from '@sentry/core';
import { wrapClientClass } from '../../src/custom/client';
import type { OpenTelemetryClient } from '../../src/types';

class BaseTestClient extends Client<ClientOptions> {
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
  const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1, ...options }));

  // The client is on the current scope, from where it generally is inherited
  getCurrentScope().setClient(client);
  client.init();
}

export function getDefaultTestClientOptions(options: Partial<Options> = {}): ClientOptions {
  return {
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  } as ClientOptions;
}
