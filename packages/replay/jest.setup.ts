/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { getCurrentHub } from '@sentry/core';
import type { ReplayRecordingData, Transport } from '@sentry/types';
import pako from 'pako';
import { TextDecoder, TextEncoder } from 'util';

import type { ReplayContainer, Session } from './src/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).TextEncoder = TextEncoder;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).TextDecoder = TextDecoder;

type MockTransport = jest.MockedFunction<Transport['send']>;

jest.mock('./src/util/isBrowser', () => {
  return {
    isBrowser: () => true,
  };
});

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
      `${this.utils.matcherHint('toHaveSameSession', undefined, undefined, options)}\n\n` +
      `Expected: ${pass ? 'not ' : ''}${this.utils.printExpected(expected)}\n` +
      `Received: ${this.utils.printReceived(received.session)}`,
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

function parseRecordingData(recordingPayload: undefined | string | Uint8Array): string {
  if (!recordingPayload) {
    return '';
  }

  if (typeof recordingPayload === 'string') {
    return recordingPayload;
  }

  if (recordingPayload instanceof Uint8Array) {
    // We look up the place where the zlib compression header(0x78 0x9c) starts
    // As the payload consists of two UInt8Arrays joined together, where the first part is a TextEncoder encoded string,
    // and the second part a pako-compressed one
    for (let i = 0; i < recordingPayload.length; i++) {
      if (recordingPayload[i] === 0x78 && recordingPayload[i + 1] === 0x9c) {
        try {
          // We found a zlib-compressed payload - let's decompress it
          const header = recordingPayload.slice(0, i);
          const payload = recordingPayload.slice(i);
          // now we return the decompressed payload as JSON
          const decompressedPayload = pako.inflate(payload, { to: 'string' });
          const decompressedHeader = new TextDecoder().decode(header);

          return `${decompressedHeader}${decompressedPayload}`;
        } catch (error) {
          throw new Error(`Could not parse UInt8Array payload: ${error}`);
        }
      }
    }
  }

  throw new Error(`Invalid recording payload: ${recordingPayload}`);
}

function checkCallForSentReplay(
  call: Call | undefined,
  expected?: SentReplayExpected | { sample: SentReplayExpected; inverse: boolean },
): CheckCallForSentReplayResult {
  const envelopeHeader = call?.[0];
  const envelopeItems = call?.[1] || [[], []];
  const [[replayEventHeader, replayEventPayload], [recordingHeader, recordingPayload] = []] = envelopeItems;

  const recordingStr = parseRecordingData(recordingPayload as unknown as string | Uint8Array);

  const [recordingPayloadHeader, recordingData] = recordingStr?.split('\n') || [];

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
 * Checks all calls to `fetch` and ensures a replay was uploaded by
 * checking the `fetch()` request's body.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const toHaveSentReplay = function (
  _received: jest.Mocked<ReplayContainer>,
  expected?: SentReplayExpected | { sample: SentReplayExpected; inverse: boolean },
) {
  const { calls } = (getCurrentHub().getClient()?.getTransport()?.send as MockTransport).mock;

  let result: CheckCallForSentReplayResult;

  for (const currentCall of calls) {
    result = checkCallForSentReplay.call(this, currentCall[0], expected);
    if (result.pass) {
      break;
    }
  }

  // @ts-ignore use before assigned
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
            .map(
              ({ key, expectedVal, actualVal }: Result) =>
                `Expected (key: ${key}): ${pass ? 'not ' : ''}${this.utils.printExpected(expectedVal)}\n` +
                `Received (key: ${key}): ${this.utils.printReceived(actualVal)}`,
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
  const { calls } = (getCurrentHub().getClient()?.getTransport()?.send as MockTransport).mock;
  const lastCall = calls[calls.length - 1]?.[0];

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
            .map(
              ({ key, expectedVal, actualVal }: Result) =>
                `Expected (key: ${key}): ${pass ? 'not ' : ''}${this.utils.printExpected(expectedVal)}\n` +
                `Received (key: ${key}): ${this.utils.printReceived(actualVal)}`,
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
