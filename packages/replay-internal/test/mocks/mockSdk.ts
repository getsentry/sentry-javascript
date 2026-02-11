import type { Envelope, Transport, TransportMakeRequestResponse } from '@sentry/core';
import { vi } from 'vitest';
import type { Replay as ReplayIntegration } from '../../src/integration';
import type { ReplayContainer } from '../../src/replay';
import type { ReplayConfiguration } from '../../src/types';
import type { TestClientOptions } from '../utils/TestClient';
import { getDefaultClientOptions, init } from '../utils/TestClient';

export interface MockSdkParams {
  replayOptions?: ReplayConfiguration;
  sentryOptions?: Partial<TestClientOptions>;
  autoStart?: boolean;
}

class MockTransport implements Transport {
  send: (request: Envelope) => PromiseLike<TransportMakeRequestResponse>;

  constructor() {
    this.send = vi.fn(async () => {
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

export async function mockSdk({ replayOptions, sentryOptions, autoStart = true }: MockSdkParams = {}): Promise<{
  replay: ReplayContainer;
  integration: ReplayIntegration;
}> {
  const { Replay } = await import('../../src/integration');

  // Scope this to the test, instead of the module
  let _initialized = false;
  class TestReplayIntegration extends Replay {
    protected get _isInitialized(): boolean {
      return _initialized;
    }
    protected set _isInitialized(value: boolean) {
      _initialized = value;
    }

    public afterAllSetup(): void {
      // do nothing, we need to manually initialize this
    }
  }

  const replayIntegration = new TestReplayIntegration({
    stickySession: false,
    minReplayDuration: 0,
    ...replayOptions,
  });

  const client = init({
    ...getDefaultClientOptions(),
    dsn: 'https://dsn@ingest.f00.f00/1',
    sendClientReports: false,
    transport: () => new MockTransport(),
    replaysSessionSampleRate: 1.0,
    replaysOnErrorSampleRate: 0.0,
    ...sentryOptions,
    integrations: [replayIntegration],
  })!;

  // Instead of `afterAllSetup`, which is tricky to test, we call this manually here
  replayIntegration['_setup'](client);

  if (autoStart) {
    // Only exists in our mock
    replayIntegration['_initialize'](client);
  }

  const replay = replayIntegration['_replay']!;

  return { replay, integration: replayIntegration };
}
