import type {
  BrowserClientReplayOptions,
  ClientOptions,
  Event,
  ParameterizedString,
  SeverityLevel,
} from '@sentry/core';
import { Client, createTransport, initAndBind, resolvedSyncPromise } from '@sentry/core';

export interface TestClientOptions extends ClientOptions, BrowserClientReplayOptions {}

export class TestClient extends Client<TestClientOptions> {
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

export function init(options: TestClientOptions): void {
  initAndBind(TestClient, options);
}

export function getDefaultClientOptions(options: Partial<ClientOptions> = {}): ClientOptions {
  return {
    integrations: [],
    dsn: 'https://username@domain/123',
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}
