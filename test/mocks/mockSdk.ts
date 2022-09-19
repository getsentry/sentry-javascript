jest.unmock('@sentry/browser');

import { BrowserOptions, init } from '@sentry/browser';
import { Transport } from '@sentry/types';

import { SentryReplay } from '@';
import { SentryReplayConfiguration } from '@/types';

interface MockSdkParams {
  replayOptions?: SentryReplayConfiguration;
  sentryOptions?: BrowserOptions;
}

class MockTransport implements Transport {
  async send() {
    return;
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

export function mockSdk({
  replayOptions = {
    stickySession: true,
    recordingConfig: { ignoreClass: 'sentry-test-ignore' },
  },
  sentryOptions = {
    dsn: 'https://dsn@ingest.f00.f00/1',
    autoSessionTracking: false,
    sendClientReports: false,
    transport: () => new MockTransport(),
  },
}: MockSdkParams = {}) {
  const replay = new SentryReplay(replayOptions);

  init({ ...sentryOptions, integrations: [replay] });
  jest.spyOn(replay, 'sendReplayRequest');

  return { replay };
}
