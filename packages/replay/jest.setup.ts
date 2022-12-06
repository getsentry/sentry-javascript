/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { getCurrentHub } from '@sentry/core';
import { Transport } from '@sentry/types';

import { ReplayContainer } from './src/replay';
import { Session } from './src/session/Session';

// @ts-ignore TS error, this is replaced in prod builds bc of rollup
global.__SENTRY_REPLAY_VERSION__ = 'version:Test';

type MockTransport = jest.MockedFunction<Transport['send']>;

jest.mock('./src/util/isBrowser', () => {
  return {
    isBrowser: () => true,
  };
});

afterEach(() => {
  const hub = getCurrentHub();
  if (typeof hub?.getClient !== 'function') {
    // Potentially not a function due to partial mocks
    return;
  }

  const client = hub?.getClient();
  // This can be weirded up by mocks/tests
  if (
    !client ||
    !client.getTransport ||
    typeof client.getTransport !== 'function' ||
    typeof client.getTransport()?.send !== 'function'
  ) {
    return;
  }

  (client.getTransport()?.send as MockTransport).mockClear();
});

type SentReplayExpected = {
  envelopeHeader?: {
    event_id: string;
    sent_at: string;
    sdk: {
      name: string;
      version?: string;
    };
  };
  replayEventHeader?: { type: 'replay_event' };
  replayEventPayload?: Record<string, unknown>;
  recordingHeader?: { type: 'replay_recording'; length: number };
  recordingPayloadHeader?: Record<string, unknown>;
  events?: string | Uint8Array;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const toHaveSameSession = function (received: jest.Mocked<ReplayContainer>, expected: undefined | Session) {
  const pass = this.equals(received.session?.id, expected?.id) as boolean;

  const options = {
    isNot: this.isNot,
    promise: this.promise,
  };

  return {
    pass,
    message: () =>
      `${this.utils.matcherHint('toHaveSameSession', undefined, undefined, options)}\n\n` +
      `Expected: ${pass ? 'not ' : ''}${this.utils.printExpected(expected)}\n` +
      `Received: ${this.utils.printReceived(received.session)}`,
  };
};

/**
 * Checks the last call to `fetch` and ensures a replay was uploaded by
 * checking the `fetch()` request's body.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const toHaveSentReplay = function (
  _received: jest.Mocked<ReplayContainer>,
  expected?: SentReplayExpected | { sample: SentReplayExpected; inverse: boolean },
) {
  const { calls } = (getCurrentHub().getClient()?.getTransport()?.send as MockTransport).mock;
  const lastCall = calls[calls.length - 1]?.[0];

  const envelopeHeader = lastCall?.[0];
  const envelopeItems = lastCall?.[1] || [[], []];
  const [[replayEventHeader, replayEventPayload], [recordingHeader, recordingPayload] = []] = envelopeItems;

  // @ts-ignore recordingPayload is always a string in our tests
  const [recordingPayloadHeader, events] = recordingPayload?.split('\n') || [];

  const actualObj: Required<SentReplayExpected> = {
    // @ts-ignore Custom envelope
    envelopeHeader: envelopeHeader,
    // @ts-ignore Custom envelope
    replayEventHeader: replayEventHeader,
    // @ts-ignore Custom envelope
    replayEventPayload: replayEventPayload,
    // @ts-ignore Custom envelope
    recordingHeader: recordingHeader,
    recordingPayloadHeader: recordingPayloadHeader && JSON.parse(recordingPayloadHeader),
    events,
  };

  const isObjectContaining = expected && 'sample' in expected && 'inverse' in expected;
  const expectedObj = isObjectContaining
    ? (expected as { sample: SentReplayExpected }).sample
    : (expected as SentReplayExpected);

  if (isObjectContaining) {
    console.warn('`expect.objectContaining` is unnecessary when using the `toHaveSentReplay` matcher');
  }

  const results = expected
    ? Object.keys(expectedObj)
        .map(key => {
          const actualVal = actualObj[key as keyof SentReplayExpected];
          const expectedVal = expectedObj[key as keyof SentReplayExpected];
          const matches = !expectedVal || this.equals(actualVal, expectedVal);

          return [matches, key, expectedVal, actualVal];
        })
        .filter(([passed]) => !passed)
    : [];

  const payloadPassed = Boolean(lastCall && (!expected || results.length === 0));

  const options = {
    isNot: this.isNot,
    promise: this.promise,
  };

  const allPass = payloadPassed;

  return {
    pass: allPass,
    message: () =>
      !lastCall
        ? allPass
          ? 'Expected Replay to not have been sent, but a request was attempted'
          : 'Expected Replay to have been sent, but a request was not attempted'
        : `${this.utils.matcherHint('toHaveSentReplay', undefined, undefined, options)}\n\n${results
            .map(
              ([, key, expected, actual]) =>
                `Expected (key: ${key}): ${payloadPassed ? 'not ' : ''}${this.utils.printExpected(expected)}\n` +
                `Received (key: ${key}): ${this.utils.printReceived(actual)}`,
            )
            .join('\n')}`,
  };
};

expect.extend({
  toHaveSameSession,
  toHaveSentReplay,
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface AsymmetricMatchers {
      toHaveSentReplay(expected?: SentReplayExpected): void;
      toHaveSameSession(expected: undefined | Session): void;
    }
    interface Matchers<R> {
      toHaveSentReplay(expected?: SentReplayExpected): R;
      toHaveSameSession(expected: undefined | Session): R;
    }
  }
}
