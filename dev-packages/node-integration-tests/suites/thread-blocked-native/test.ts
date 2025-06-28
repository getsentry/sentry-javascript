import { join } from 'node:path';
import type { Event } from '@sentry/core';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

function EXCEPTION(thread_id = '0') {
  return {
    values: [
      {
        type: 'EventLoopBlocked',
        value: 'Event Loop Blocked for at least 1000 ms',
        mechanism: { type: 'ANR' },
        thread_id,
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
  };
}

const ANR_EVENT = {
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
  threads: {
    values: [
      {
        id: '0',
        name: 'main',
        crashed: true,
        current: true,
        main: true,
      },
    ],
  },
  // and an exception that is our ANR
  exception: EXCEPTION(),
};

function ANR_EVENT_WITH_DEBUG_META(file: string): Event {
  return {
    ...ANR_EVENT,
    debug_meta: {
      images: [
        {
          type: 'sourcemap',
          debug_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa',
          code_file: expect.stringContaining(file),
        },
      ],
    },
  };
}

describe('Thread Blocked Native', { timeout: 30_000 }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('CJS', async () => {
    await createRunner(__dirname, 'basic.js')
      .withMockSentryServer()
      .expect({ event: ANR_EVENT_WITH_DEBUG_META('basic') })
      .start()
      .completed();
  });

  test('ESM', async () => {
    await createRunner(__dirname, 'basic.mjs')
      .withMockSentryServer()
      .expect({ event: ANR_EVENT_WITH_DEBUG_META('basic') })
      .start()
      .completed();
  });

  test('Custom appRootPath', async () => {
    const ANR_EVENT_WITH_SPECIFIC_DEBUG_META: Event = {
      ...ANR_EVENT,
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

    await createRunner(__dirname, 'app-path.mjs')
      .withMockSentryServer()
      .expect({ event: ANR_EVENT_WITH_SPECIFIC_DEBUG_META })
      .start()
      .completed();
  });

  test('multiple events via maxEventsPerHour', async () => {
    await createRunner(__dirname, 'basic-multiple.mjs')
      .withMockSentryServer()
      .expect({ event: ANR_EVENT_WITH_DEBUG_META('basic-multiple') })
      .expect({ event: ANR_EVENT_WITH_DEBUG_META('basic-multiple') })
      .start()
      .completed();
  });

  test('blocked indefinitely', async () => {
    await createRunner(__dirname, 'indefinite.mjs')
      .withMockSentryServer()
      .expect({ event: ANR_EVENT })
      .start()
      .completed();
  });

  test('should exit', async () => {
    const runner = createRunner(__dirname, 'should-exit.js').start();

    await new Promise(resolve => setTimeout(resolve, 5_000));

    expect(runner.childHasExited()).toBe(true);
  });

  test('should exit forced', async () => {
    const runner = createRunner(__dirname, 'should-exit-forced.js').start();

    await new Promise(resolve => setTimeout(resolve, 5_000));

    expect(runner.childHasExited()).toBe(true);
  });

  test('worker thread', async () => {
    const instrument = join(__dirname, 'instrument.mjs');
    await createRunner(__dirname, 'worker-main.mjs')
      .withMockSentryServer()
      .withFlags('--import', instrument)
      .expect({
        event: event => {
          const crashedThread = event.threads?.values?.find(thread => thread.crashed)?.id as string;
          expect(crashedThread).toBeDefined();

          expect(event).toMatchObject({
            ...ANR_EVENT,
            exception: {
              ...EXCEPTION(crashedThread),
            },
            threads: {
              values: [
                {
                  id: '0',
                  name: 'main',
                  crashed: false,
                  current: true,
                  main: true,
                  stacktrace: {
                    frames: expect.any(Array),
                  },
                },
                {
                  id: crashedThread,
                  name: `worker-${crashedThread}`,
                  crashed: true,
                  current: true,
                  main: false,
                },
              ],
            },
          });
        },
      })
      .start()
      .completed();
  });
});
