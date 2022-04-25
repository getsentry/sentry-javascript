import type { RRWebEvent } from '@/types';

import { SentryReplay } from '@';
import { ReplaySession } from '@/session';

const ATTACHMENTS_URL_REGEX = new RegExp(
  'https://ingest.f00.f00/api/1/events/[^/]+/attachments/\\?sentry_key=dsn&sentry_version=7&sentry_client=replay'
);

expect.extend({
  toHaveSameSession(
    received: jest.Mocked<SentryReplay>,
    expected: ReplaySession
  ) {
    const pass = this.equals(received.session, expected);

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
    expected?: RRWebEvent[]
  ) {
    const { calls } = received.sendReplayRequest.mock;
    const lastCall = calls[calls.length - 1];

    const pass =
      !!lastCall &&
      ATTACHMENTS_URL_REGEX.test(lastCall[0]) &&
      this.equals(expected, lastCall[1]);

    const options = {
      isNot: this.isNot,
      promise: this.promise,
    };

    return {
      pass,
      message: () =>
        !lastCall
          ? pass
            ? 'Expected Replay to not have been sent, but a request was attempted'
            : 'Expected Replay to have been sent, but a request was not attempted'
          : this.utils.matcherHint(
              'toHaveSentReplay',
              undefined,
              undefined,
              options
            ) +
            '\n\n' +
            `Expected: ${pass ? 'not ' : ''}${this.utils.printExpected(
              expected
            )}\n` +
            `Received: ${this.utils.printReceived(lastCall[1])}`,
    };
  },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toHaveSentReplay(expected?: RRWebEvent[]): CustomMatcherResult;
      toHaveSameSession(expected: ReplaySession): CustomMatcherResult;
    }
  }
}
