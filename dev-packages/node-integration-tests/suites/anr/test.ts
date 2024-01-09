import { conditionalTest } from '../../utils';
import { assertSentryEvent, assertSentrySession, createRunner } from '../../utils/runner';

const EXPECTED_ANR_EVENT = {
  // Ensure we have context
  contexts: {
    trace: {
      span_id: expect.any(String),
      trace_id: expect.any(String),
    },
    device: {
      arch: expect.any(String),
    },
    app: {
      app_start_time: expect.any(String),
    },
    os: {
      name: expect.any(String),
    },
    culture: {
      timezone: expect.any(String),
    },
  },
  // and an exception that is our ANR
  exception: {
    values: [
      {
        type: 'ApplicationNotResponding',
        value: 'Application Not Responding for at least 200 ms',
        mechanism: { type: 'ANR' },
        stacktrace: {
          frames: expect.arrayContaining([
            {
              colno: expect.any(Number),
              lineno: expect.any(Number),
              filename: expect.any(String),
              function: '?',
              in_app: true,
            },
            {
              colno: expect.any(Number),
              lineno: expect.any(Number),
              filename: expect.any(String),
              function: 'longWork',
              in_app: true,
            },
          ]),
        },
      },
    ],
  },
};

conditionalTest({ min: 16 })('should report ANR when event loop blocked', () => {
  // TODO (v8): Remove this old API and this test
  test('Legacy API', done => {
    createRunner(__dirname, 'legacy.js')
      .expect({
        event: event => {
          assertSentryEvent(event, EXPECTED_ANR_EVENT);
        },
      })
      .start(done);
  });

  test('CJS', done => {
    createRunner(__dirname, 'basic.js')
      .expect({
        event: event => {
          assertSentryEvent(event, EXPECTED_ANR_EVENT);
        },
      })
      .start(done);
  });

  test('ESM', done => {
    createRunner(__dirname, 'basic.mjs')
      .expect({
        event: event => {
          assertSentryEvent(event, EXPECTED_ANR_EVENT);
        },
      })
      .start(done);
  });

  test('With --inspect', done => {
    createRunner(__dirname, 'basic.mjs')
      .withFlags('--inspect')
      .expect({
        event: event => {
          assertSentryEvent(event, EXPECTED_ANR_EVENT);
        },
      })
      .start(done);
  });

  test('should exit', done => {
    const runner = createRunner(__dirname, 'should-exit.js').start();

    setTimeout(() => {
      expect(runner.childHasExited()).toBe(true);
      done();
    }, 5_000);
  });

  test('should exit forced', done => {
    const runner = createRunner(__dirname, 'should-exit-forced.js').start();

    setTimeout(() => {
      expect(runner.childHasExited()).toBe(true);
      done();
    }, 5_000);
  });

  test('With session', done => {
    createRunner(__dirname, 'basic-session.js')
      .expect({
        session: session => {
          assertSentrySession(session, {
            status: 'abnormal',
            abnormal_mechanism: 'anr_foreground',
          });
        },
      })
      .expect({
        event: event => {
          assertSentryEvent(event, EXPECTED_ANR_EVENT);
        },
      })
      .start(done);
  });

  test('from forked process', done => {
    createRunner(__dirname, 'forker.js')
      .expect({
        event: event => {
          assertSentryEvent(event, EXPECTED_ANR_EVENT);
        },
      })
      .start(done);
  });
});
