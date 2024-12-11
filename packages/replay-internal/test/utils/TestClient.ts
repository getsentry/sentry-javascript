import { BaseClient, createTransport, initAndBind } from '@sentry/core';
import { resolvedSyncPromise } from '@sentry/core';
import type {
  BrowserClientReplayOptions,
  Client,
  ClientOptions,
  Event,
  ParameterizedString,
  SeverityLevel,
} from '@sentry/core';

export interface TestClientOptions extends ClientOptions, BrowserClientReplayOptions {}

export class TestClient extends BaseClient<TestClientOptions> {
  public constructor(options: TestClientOptions) {
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

  public eventFromMessage(message: ParameterizedString, level: SeverityLevel = 'info'): PromiseLike<Event> {
    return resolvedSyncPromise({ message, level });
  }
}

export function init(options: TestClientOptions): Client {
  return initAndBind(TestClient, options);
}

export function getDefaultClientOptions(options: Partial<TestClientOptions> = {}): ClientOptions {
  return {
    integrations: [],
    dsn: 'https://username@domain/123',
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}
