import type { Envelope, Transport, TransportMakeRequestResponse } from '@sentry/types';

import type { TestClientOptions } from '../utils/TestClient';
import { getDefaultClientOptions, init } from '../utils/TestClient';

export interface MockSdkParams {
  sentryOptions?: Partial<TestClientOptions>;
}

class MockTransport implements Transport {
  send: (request: Envelope) => PromiseLike<TransportMakeRequestResponse>;

  constructor() {
    this.send = jest.fn(async () => {
      return {
        statusCode: 200,
      };
    });
  }

  async flush() {
    return true;
  }
  async sendEvent(_e: Event) {
    return {
      status: 'skipped',
      event: 'ok',
      type: 'transaction',
    };
  }
  async sendSession() {
    return;
  }
  async recordLostEvent() {
    return;
  }
  async close() {
    return;
  }
}

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
