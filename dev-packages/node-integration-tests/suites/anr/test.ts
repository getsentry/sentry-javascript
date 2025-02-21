import type { Event } from '@sentry/core';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

const ANR_EVENT = {
  // Ensure we have context
  contexts: {
    trace: {
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
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
        value: 'Application Not Responding for at least 100 ms',
        mechanism: { type: 'ANR' },
        stacktrace: {
          frames: expect.arrayContaining([
            expect.objectContaining({
              colno: expect.any(Number),
              lineno: expect.any(Number),
              filename: expect.any(String),
              function: '?',
              in_app: true,
            }),
            expect.objectContaining({
              colno: expect.any(Number),
              lineno: expect.any(Number),
              filename: expect.any(String),
              function: 'longWork',
              in_app: true,
            }),
          ]),
        },
      },
    ],
  },
};

const ANR_EVENT_WITHOUT_STACKTRACE = {
  // Ensure we have context
  contexts: {
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
        value: 'Application Not Responding for at least 100 ms',
        mechanism: { type: 'ANR' },
        stacktrace: {},
      },
    ],
  },
};

const ANR_EVENT_WITH_SCOPE = {
  ...ANR_EVENT,
  user: {
    email: 'person@home.com',
  },
  breadcrumbs: expect.arrayContaining([
    {
      timestamp: expect.any(Number),
      message: 'important message!',
    },
  ]),
};

const ANR_EVENT_WITH_DEBUG_META: Event = {
  ...ANR_EVENT_WITH_SCOPE,
  debug_meta: {
    images: [
      {
        type: 'sourcemap',
        debug_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa',
        code_file: expect.stringContaining('basic'),
      },
    ],
  },
};

describe('should report ANR when event loop blocked', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('CJS', done => {
    createRunner(__dirname, 'basic.js').withMockSentryServer().expect({ event: ANR_EVENT_WITH_DEBUG_META }).start(done);
  });

  test('ESM', done => {
    createRunner(__dirname, 'basic.mjs')
      .withMockSentryServer()
      .expect({ event: ANR_EVENT_WITH_DEBUG_META })
      .start(done);
  });

  test('Custom appRootPath', done => {
    const ANR_EVENT_WITH_SPECIFIC_DEBUG_META: Event = {
      ...ANR_EVENT_WITH_SCOPE,
      debug_meta: {
        images: [
          {
            type: 'sourcemap',
            debug_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa',
            code_file: 'app:///app-path.mjs',
          },
        ],
      },
    };

    createRunner(__dirname, 'app-path.mjs')
      .withMockSentryServer()
      .expect({ event: ANR_EVENT_WITH_SPECIFIC_DEBUG_META })
      .start(done);
  });

  test('multiple events via maxAnrEvents', done => {
    createRunner(__dirname, 'basic-multiple.mjs')
      .withMockSentryServer()
      .expect({ event: ANR_EVENT_WITH_DEBUG_META })
      .expect({ event: ANR_EVENT_WITH_DEBUG_META })
      .start(done);
  });

  test('blocked indefinitely', done => {
    createRunner(__dirname, 'indefinite.mjs').withMockSentryServer().expect({ event: ANR_EVENT }).start(done);
  });

  test("With --inspect the debugger isn't used", done => {
    createRunner(__dirname, 'basic.mjs')
      .withMockSentryServer()
      .withFlags('--inspect')
      .expect({ event: ANR_EVENT_WITHOUT_STACKTRACE })
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
      .withMockSentryServer()
      .unignore('session')
      .expect({
        session: {
          status: 'abnormal',
          abnormal_mechanism: 'anr_foreground',
          attrs: {
            release: '1.0.0',
          },
        },
      })
      .expect({ event: ANR_EVENT_WITH_SCOPE })
      .start(done);
  });

  test('from forked process', done => {
    createRunner(__dirname, 'forker.js').expect({ event: ANR_EVENT_WITH_SCOPE }).start(done);
  });

  test('worker can be stopped and restarted', done => {
    createRunner(__dirname, 'stop-and-start.js').expect({ event: ANR_EVENT_WITH_SCOPE }).start(done);
  });

  const EXPECTED_ISOLATED_EVENT = {
    user: {
      id: 5,
    },
    exception: {
      values: [
        {
          type: 'ApplicationNotResponding',
          value: 'Application Not Responding for at least 100 ms',
          mechanism: { type: 'ANR' },
          stacktrace: {
            frames: expect.arrayContaining([
              {
                colno: expect.any(Number),
                lineno: expect.any(Number),
                filename: expect.stringMatching(/isolated.mjs$/),
                function: 'longWork',
                in_app: true,
              },
            ]),
          },
        },
      ],
    },
  };

  test('fetches correct isolated scope', done => {
    createRunner(__dirname, 'isolated.mjs')
      .withMockSentryServer()
      .expect({ event: EXPECTED_ISOLATED_EVENT })
      .start(done);
  });
});
