import { captureException, init, SentryEvent } from '../src';

const dsn = 'https://9e9fd4523d784609a5fc0ebb1080592f@sentry.io/50622';

describe('HTTPTransport', () => {
  test('captureEvent', done => {
    init({
      afterSend: (event: SentryEvent) => {
        expect(event.message).toBe('test');
        done();
      },
      dsn,
    });
    captureException(new Error('wat'));
  });
});
