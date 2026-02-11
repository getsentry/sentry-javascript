import type { Envelope, Transport, TransportMakeRequestResponse } from '@sentry/core';
import { vi } from 'vitest';
import type { TestClientOptions } from '../../src/core/TestClient';
import { getDefaultClientOptions, init } from '../../src/core/TestClient';

export interface MockSdkParams {
  sentryOptions?: Partial<TestClientOptions>;
}

class MockTransport implements Transport {
  public send: (request: Envelope) => PromiseLike<TransportMakeRequestResponse>;

  public constructor() {
    this.send = vi.fn(async () => {
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
    sendClientReports: false,
    transport: () => new MockTransport(),
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 0.0,
    ...sentryOptions,
  });
}
