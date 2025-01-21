import type { Event } from '@sentry/core';
import { conditionalTest } from '../../utils';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

const WORKER_EVENT: Event = {
  exception: {
    values: [
      {
        type: 'Error',
        value: 'Test error',
        mechanism: {
          type: 'instrument',
          handled: false,
          data: {
            threadId: expect.any(String),
          },
        },
      },
    ],
  },
};

const CHILD_EVENT: Event = {
  exception: {
    values: [
      {
        type: 'Error',
        value: 'Exiting main process',
      },
    ],
  },
  breadcrumbs: [
    {
      category: 'child_process',
      message: "Child process exited with code '1'",
      level: 'warning',
    },
  ],
};

describe('should capture child process events', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  conditionalTest({ min: 20 })('worker', () => {
    test('ESM', done => {
      createRunner(__dirname, 'worker.mjs').expect({ event: WORKER_EVENT }).start(done);
    });

    test('CJS', done => {
      createRunner(__dirname, 'worker.js').expect({ event: WORKER_EVENT }).start(done);
    });
  });

  conditionalTest({ min: 20 })('fork', () => {
    test('ESM', done => {
      createRunner(__dirname, 'fork.mjs').expect({ event: CHILD_EVENT }).start(done);
    });

    test('CJS', done => {
      createRunner(__dirname, 'fork.js').expect({ event: CHILD_EVENT }).start(done);
    });
  });
});
