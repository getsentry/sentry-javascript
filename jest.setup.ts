import { Session } from './src/session/Session';
import { Replay } from './src';

// @ts-expect-error TS error, this is replaced in prod builds bc of rollup
global.__SENTRY_REPLAY_VERSION__ = 'version:Test';

type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit | undefined
) => Promise<Response>;

type MockFetch = jest.MockedFunction<Fetch>;

// Not the best fetch mock, but probably good enough - (remove the
// Headers/Response casts to see unmocked behavior)
const mockFetch = jest.fn(
  (_input: RequestInfo | URL) =>
    new Promise<Response>((resolve) => {
      resolve({
        body: null,
        bodyUsed: false,
        headers: {} as Headers,
        ok: true,
        redirected: false,
        status: 200,
        statusText: '',
        type: 'default',
        url: '',
      } as Response);
    })
);

beforeAll(() => {
  // mock fetch
  if (typeof global.fetch === 'undefined') {
    global.fetch = mockFetch;
  } else {
    // `jsdom-worker` has its own fetch that should not be mocked
    if ('jsdomWorker' in global.fetch) {
      return;
    }

    jest.spyOn(global, 'fetch');
    (global.fetch as MockFetch).mockImplementation(mockFetch);
  }
});

afterEach(() => {
  // `jsdom-worker` has its own fetch that should not be mocked
  if (!('jsdomWorker' in global.fetch)) {
    (global.fetch as MockFetch).mockClear();
  }
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
  replayEventPayload?: Record<string, any>;
  recordingHeader?: { type: 'replay_recording'; length: number };
  recordingPayloadHeader?: Record<string, any>;
  events?: string | Uint8Array;
};

const ENVELOPE_URL_REGEX = new RegExp(
  'https://ingest.f00.f00/api/1/envelope/\\?sentry_key=dsn&sentry_version=7'
);

expect.extend({
  toHaveSameSession(
    received: jest.Mocked<Replay>,
    expected: undefined | Session
  ) {
    const pass = this.equals(received.session?.id, expected?.id) as boolean;

    const options = {
      isNot: this.isNot,
      promise: this.promise,
    };

    return {
      pass,
      message: () =>
        this.utils.matcherHint(
          'toHaveSameSession',
          undefined,
          undefined,
          options
        ) +
        '\n\n' +
        `Expected: ${pass ? 'not ' : ''}${this.utils.printExpected(
          expected
        )}\n` +
        `Received: ${this.utils.printReceived(received.session)}`,
    };
  },

  /**
   * Checks the last call to `fetch` and ensures a replay was uploaded by
   * checking the `fetch()` request's body.
   */
  toHaveSentReplay(
    _received: jest.Mocked<Replay>,
    expected?:
      | SentReplayExpected
      | { sample: SentReplayExpected; inverse: boolean }
  ) {
    const { calls } = (global.fetch as MockFetch).mock;
    const lastCall = calls[calls.length - 1];

    const { body } = lastCall?.[1] || {};
    const bodyLines = (body && body.toString().split('\n')) || [];
    const [
      envelopeHeader,
      replayEventHeader,
      replayEventPayload,
      recordingHeader,
      recordingPayloadHeader,
      events,
    ] = bodyLines;
    const actualObj: Required<SentReplayExpected> = {
      envelopeHeader: envelopeHeader && JSON.parse(envelopeHeader),
      replayEventHeader: replayEventHeader && JSON.parse(replayEventHeader),
      replayEventPayload: replayEventPayload && JSON.parse(replayEventPayload),
      recordingHeader: recordingHeader && JSON.parse(recordingHeader),
      recordingPayloadHeader:
        recordingPayloadHeader && JSON.parse(recordingPayloadHeader),
      events,
    };
    const urlPass =
      !!lastCall && ENVELOPE_URL_REGEX.test(lastCall?.[0].toString());

    const isObjectContaining =
      expected && 'sample' in expected && 'inverse' in expected;
    const expectedObj = isObjectContaining ? expected.sample : expected;

    if (isObjectContaining) {
      console.warn(
        '`expect.objectContaining` is unnecessary when using the `toHaveSentReplay` matcher'
      );
    }
    const results = expected
      ? Object.entries(actualObj)
          .map(([key, val]: [key: keyof SentReplayExpected, val: any]) => {
            return [
              !expectedObj?.[key] || this.equals(expectedObj[key], val),
              key,
              expectedObj?.[key],
              val,
            ];
          })
          .filter(([passed]) => !passed)
      : [];

    const payloadPassed = lastCall && (!expected || results.length === 0);

    const options = {
      isNot: this.isNot,
      promise: this.promise,
    };

    const allPass = urlPass && payloadPassed;

    return {
      pass: allPass,
      message: () =>
        !lastCall
          ? allPass
            ? 'Expected Replay to not have been sent, but a request was attempted'
            : 'Expected Replay to have been sent, but a request was not attempted'
          : this.utils.matcherHint(
              'toHaveSentReplay',
              undefined,
              undefined,
              options
            ) +
            '\n\n' +
            (!urlPass
              ? `Expected URL: ${
                  !urlPass ? 'not ' : ''
                }${this.utils.printExpected(ENVELOPE_URL_REGEX)}\n` +
                `Received URL: ${this.utils.printReceived(lastCall[0])}`
              : '') +
            results
              .map(
                ([, key, expected, actual]) =>
                  `Expected (key: ${key}): ${
                    payloadPassed ? 'not ' : ''
                  }${this.utils.printExpected(expected)}\n` +
                  `Received (key: ${key}): ${this.utils.printReceived(actual)}`
              )
              .join('\n'),
    };
  },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Matchers<R> {
      toHaveSentReplay(expected?: SentReplayExpected): CustomMatcherResult;
      toHaveSameSession(expected: undefined | Session): CustomMatcherResult;
    }
  }
}
