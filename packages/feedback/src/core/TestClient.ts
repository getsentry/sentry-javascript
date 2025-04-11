import type { BrowserClientReplayOptions, ClientOptions, Event, SeverityLevel } from '@sentry/core';
import { Client, createTransport, initAndBind, resolvedSyncPromise } from '@sentry/core';

export interface TestClientOptions extends ClientOptions, BrowserClientReplayOptions {}

/**
 *
 */
export class TestClient extends Client<TestClientOptions> {
  public constructor(options: TestClientOptions) {
    super(options);
  }

  /**
   *
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public eventFromException(exception: any): PromiseLike<Event> {
    return resolvedSyncPromise({
      exception: {
        values: [
          {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            type: exception.name,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            value: exception.message,
          },
        ],
      },
    });
  }

  /**
   *
   */
  public eventFromMessage(message: string, level: SeverityLevel = 'info'): PromiseLike<Event> {
    return resolvedSyncPromise({ message, level });
  }
}

/**
 *
 */
export function init(options: TestClientOptions): void {
  initAndBind(TestClient, options);
}

/**
 *
 */
export function getDefaultClientOptions(options: Partial<ClientOptions> = {}): ClientOptions {
  return {
    integrations: [],
    dsn: 'https://username@domain/123',
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}
