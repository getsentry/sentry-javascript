import { SentryReplay } from '@';
import { Session } from '@/session/Session';

const ENVELOPE_URL_REGEX = new RegExp(
  'https://ingest.f00.f00/api/1/envelope/\\?sentry_key=dsn&sentry_version=7'
);

expect.extend({
  toHaveSameSession(
    received: jest.Mocked<SentryReplay>,
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
   * Checks the last call to `sendReplayRequest` and ensures a replay was uploaded
   */
  toHaveSentReplay(
    received: jest.Mocked<SentryReplay>,
    expected?: string | Uint8Array
  ) {
    const { calls } = received.sendReplayRequest.mock;
    const lastCall = calls[calls.length - 1];

    const urlPass = !!lastCall && ENVELOPE_URL_REGEX.test(lastCall[0].endpoint);
    const payloadPass = !!lastCall && this.equals(expected, lastCall[0].events);

    const options = {
      isNot: this.isNot,
      promise: this.promise,
    };

    return {
      pass: urlPass && payloadPass,
      message: () =>
        !lastCall
          ? urlPass && payloadPass
            ? 'Expected Replay to not have been sent, but a request was attempted'
            : 'Expected Replay to have been sent, but a request was not attempted'
          : this.utils.matcherHint(
              'toHaveSentReplay',
              undefined,
              undefined,
              options
            ) +
            '\n\n' +
            `Expected: ${
              urlPass && payloadPass ? 'not ' : ''
            }${this.utils.printExpected(
              payloadPass ? ENVELOPE_URL_REGEX : expected
            )}\n` +
            `Received: ${this.utils.printReceived(
              payloadPass ? lastCall[0].endpoint : lastCall[0].events
            )}`,
    };
  },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Matchers<R> {
      toHaveSentReplay(expected?: string | Uint8Array): CustomMatcherResult;
      toHaveSameSession(expected: undefined | Session): CustomMatcherResult;
    }
  }
}
