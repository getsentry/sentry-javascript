import type { BrowserOptions } from '@sentry/browser';
import { Envelope, Transport } from '@sentry/types';

import { Replay as ReplayClass } from '../../src';
import { ReplayConfiguration } from '../../src/types';

export interface MockSdkParams {
  replayOptions?: ReplayConfiguration;
  sentryOptions?: BrowserOptions;
}

class MockTransport implements Transport {
  send: (request: Envelope) => PromiseLike<void> = jest.fn(async () => {
    return;
  });
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

export async function mockSdk({ replayOptions, sentryOptions }: MockSdkParams = {}): Promise<{ replay: ReplayClass }> {
  const { init } = jest.requireActual('@sentry/browser');

  const { Replay } = await import('../../src');
  const replay = new Replay({
    stickySession: false,
    ...replayOptions,
  });

  init({
    dsn: 'https://dsn@ingest.f00.f00/1',
    autoSessionTracking: false,
    sendClientReports: false,
    transport: () => new MockTransport(),
    replaysSessionSampleRate: 1.0,
    replaysOnErrorSampleRate: 0.0,
    ...sentryOptions,
    integrations: [replay],
  });

  // setupOnce is only called the first time, so we ensure to re-parse the options every time
  replay['_loadReplayOptionsFromClient']();

  // The first time the integration is used, `start()` is called (in setupOnce)
  // For consistency, we want to stop that
  replay.stop();

  return { replay };
}
