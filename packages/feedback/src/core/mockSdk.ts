import type { Envelope, Transport, TransportMakeRequestResponse } from '@sentry/types';

import type { TestClientOptions } from './TestClient';
import { getDefaultClientOptions, init } from './TestClient';

export interface MockSdkParams {
  sentryOptions?: Partial<TestClientOptions>;
}

class MockTransport implements Transport {
  public send: (request: Envelope) => PromiseLike<TransportMakeRequestResponse>;

  public constructor() {
    this.send = jest.fn(async () => {
      return {
        statusCode: 200,
      };
    });
  }

  public async flush(): Promise<boolean> {
    return true;
  }
  public async sendEvent(_e: Event): Promise<unknown> {
    return {
      status: 'skipped',
      event: 'ok',
      type: 'transaction',
    };
  }
  public async sendSession(): Promise<void> {
    return;
  }
  public async recordLostEvent(): Promise<void> {
    return;
  }
  public async close(): Promise<void> {
    return;
  }
}

/**
 *
 */
export async function mockSdk({ sentryOptions }: MockSdkParams = {}): Promise<void> {
  init({
    ...getDefaultClientOptions(),
    dsn: 'https://dsn@ingest.f00.f00/1',
    autoSessionTracking: false,
    sendClientReports: false,
    transport: () => new MockTransport(),
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 0.0,
    ...sentryOptions,
  });
}
