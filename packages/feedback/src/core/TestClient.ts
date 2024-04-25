import { BaseClient, createTransport, initAndBind } from '@sentry/core';
import type { BrowserClientReplayOptions, ClientOptions, Event, SeverityLevel } from '@sentry/types';

export interface TestClientOptions extends ClientOptions, BrowserClientReplayOptions {}

/**
 *
 */
export class TestClient extends BaseClient<TestClientOptions> {
  public constructor(options: TestClientOptions) {
    super(options);
  }

  /**
   *
   */
  public eventFromException(exception: any): Promise<Event> {
    return Promise.resolve({
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
  public eventFromMessage(message: string, level: SeverityLevel = 'info'): Promise<Event> {
    return Promise.resolve({ message, level });
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
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
    stackParser: () => [],
    ...options,
  };
}
