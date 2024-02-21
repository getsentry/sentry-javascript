import { TextEncoder } from 'util';
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { getClient } from '@sentry/core';
import type { ReplayRecordingData, Transport } from '@sentry/types';
import * as SentryUtils from '@sentry/utils';

import type { ReplayContainer, Session } from './src/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).TextEncoder = TextEncoder;

type MockTransport = jest.MockedFunction<Transport['send']>;

jest.spyOn(SentryUtils, 'isBrowser').mockImplementation(() => true);

type EnvelopeHeader = {
  event_id: string;
  sent_at: string;
  sdk: {
    name: string;
    version?: string;
  };
};

type ReplayEventHeader = { type: 'replay_event' };
type ReplayEventPayload = Record<string, unknown>;
type RecordingHeader = { type: 'replay_recording'; length: number };
type RecordingPayloadHeader = Record<string, unknown>;
type SentReplayExpected = {
  envelopeHeader?: EnvelopeHeader;
  replayEventHeader?: ReplayEventHeader;
  replayEventPayload?: ReplayEventPayload;
  recordingHeader?: RecordingHeader;
  recordingPayloadHeader?: RecordingPayloadHeader;
  recordingData?: ReplayRecordingData;
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
      `${this.utils.matcherHint(
        'toHaveSameSession',
        undefined,
        undefined,
        options,
      )}\n\n${this.utils.printDiffOrStringify(expected, received.session, 'Expected', 'Received')}`,
  };
};

type Result = {
  passed: boolean;
  key: string;
  expectedVal: SentReplayExpected[keyof SentReplayExpected];
  actualVal: SentReplayExpected[keyof SentReplayExpected];
};
type Call = [
  EnvelopeHeader,
  [
    [ReplayEventHeader | undefined, ReplayEventPayload | undefined],
    [RecordingHeader | undefined, RecordingPayloadHeader | undefined],
  ],
];
type CheckCallForSentReplayResult = { pass: boolean; call: Call | undefined; results: Result[] };

function checkCallForSentReplay(
  call: Call | undefined,
  expected?: SentReplayExpected | { sample: SentReplayExpected; inverse: boolean },
): CheckCallForSentReplayResult {
  const envelopeHeader = call?.[0];
  const envelopeItems = call?.[1] || [[], []];
  const [[replayEventHeader, replayEventPayload], [recordingHeader, recordingPayload] = []] = envelopeItems;

  // @ts-expect-error recordingPayload is always a string in our tests
  const [recordingPayloadHeader, recordingData] = recordingPayload?.split('\n') || [];

  const actualObj: Required<SentReplayExpected> = {
    // @ts-expect-error Custom envelope
    envelopeHeader: envelopeHeader,
    // @ts-expect-error Custom envelope
    replayEventHeader: replayEventHeader,
    // @ts-expect-error Custom envelope
    replayEventPayload: replayEventPayload,
    // @ts-expect-error Custom envelope
    recordingHeader: recordingHeader,
    recordingPayloadHeader: recordingPayloadHeader && JSON.parse(recordingPayloadHeader),
    recordingData,
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
          const passed = !expectedVal || this.equals(actualVal, expectedVal);

          return { passed, key, expectedVal, actualVal };
        })
        .filter(({ passed }) => !passed)
    : [];

  const pass = Boolean(call && (!expected || results.length === 0));

  return {
    pass,
    call,
    results,
  };
}

/**
 * Only want calls that send replay events, i.e. ignore error events
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getReplayCalls(calls: any[][][]): any[][][] {
  return calls
    .map(call => {
      const arg = call[0];
      if (arg.length !== 2) {
        return [];
      }

      if (!arg[1][0].find(({ type }: { type: string }) => ['replay_event', 'replay_recording'].includes(type))) {
        return [];
      }

      return [arg];
    })
    .filter(Boolean);
}

/**
 * Checks all calls to `fetch` and ensures a replay was uploaded by
 * checking the `fetch()` request's body.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const toHaveSentReplay = function (
  _received: jest.Mocked<ReplayContainer>,
  expected?: SentReplayExpected | { sample: SentReplayExpected; inverse: boolean },
) {
  const { calls } = (getClient()?.getTransport()?.send as MockTransport).mock;

  let result: CheckCallForSentReplayResult;

  const expectedKeysLength = expected
    ? ('sample' in expected ? Object.keys(expected.sample) : Object.keys(expected)).length
    : 0;

  const replayCalls = getReplayCalls(calls);

  for (const currentCall of replayCalls) {
    result = checkCallForSentReplay.call(this, currentCall[0], expected);
    if (result.pass) {
      break;
    }

    // stop on the first call where any of the expected obj passes
    if (result.results.length < expectedKeysLength) {
      break;
    }
  }

  // @ts-expect-error use before assigned
  const { results, call, pass } = result;

  const options = {
    isNot: this.isNot,
    promise: this.promise,
  };

  return {
    pass,
    message: () =>
      !call
        ? pass
          ? 'Expected Replay to not have been sent, but a request was attempted'
          : 'Expected Replay to have been sent, but a request was not attempted'
        : `${this.utils.matcherHint('toHaveSentReplay', undefined, undefined, options)}\n\n${results
            .map(({ key, expectedVal, actualVal }: Result) =>
              this.utils.printDiffOrStringify(
                expectedVal,
                actualVal,
                `Expected (key: ${key})`,
                `Received (key: ${key})`,
              ),
            )
            .join('\n')}`,
  };
};

/**
 * Checks the last call to `fetch` and ensures a replay was uploaded by
 * checking the `fetch()` request's body.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const toHaveLastSentReplay = function (
  _received: jest.Mocked<ReplayContainer>,
  expected?: SentReplayExpected | { sample: SentReplayExpected; inverse: boolean },
) {
  const { calls } = (getClient()?.getTransport()?.send as MockTransport).mock;
  const replayCalls = getReplayCalls(calls);

  const lastCall = replayCalls[calls.length - 1]?.[0];

  const { results, call, pass } = checkCallForSentReplay.call(this, lastCall, expected);

  const options = {
    isNot: this.isNot,
    promise: this.promise,
  };

  return {
    pass,
    message: () =>
      !call
        ? pass
          ? 'Expected Replay to not have been sent, but a request was attempted'
          : 'Expected Replay to have last been sent, but a request was not attempted'
        : `${this.utils.matcherHint('toHaveSentReplay', undefined, undefined, options)}\n\n${results
            .map(({ key, expectedVal, actualVal }: Result) =>
              this.utils.printDiffOrStringify(
                expectedVal,
                actualVal,
                `Expected (key: ${key})`,
                `Received (key: ${key})`,
              ),
            )
            .join('\n')}`,
  };
};

expect.extend({
  toHaveSameSession,
  toHaveSentReplay,
  toHaveLastSentReplay,
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface AsymmetricMatchers {
      toHaveSentReplay(expected?: SentReplayExpected): void;
      toHaveLastSentReplay(expected?: SentReplayExpected): void;
      toHaveSameSession(expected: undefined | Session): void;
    }
    interface Matchers<R> {
      toHaveSentReplay(expected?: SentReplayExpected): R;
      toHaveLastSentReplay(expected?: SentReplayExpected): R;
      toHaveSameSession(expected: undefined | Session): R;
    }
  }
}
