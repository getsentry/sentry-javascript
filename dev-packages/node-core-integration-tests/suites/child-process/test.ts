import type { Event } from '@sentry/core';
import { afterAll, describe, expect, test } from 'vitest';
import { conditionalTest } from '../../utils';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

const WORKER_EVENT: Event = {
  exception: {
    values: [
      {
        type: 'Error',
        value: 'Test error',
        mechanism: {
          type: 'auto.child_process.worker_thread',
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
    test('ESM', async () => {
      await createRunner(__dirname, 'worker.mjs').expect({ event: WORKER_EVENT }).start().completed();
    });

    test('CJS', async () => {
      await createRunner(__dirname, 'worker.js').expect({ event: WORKER_EVENT }).start().completed();
    });
  });

  conditionalTest({ min: 20 })('fork', () => {
    test('ESM', async () => {
      await createRunner(__dirname, 'fork.mjs').expect({ event: CHILD_EVENT }).start().completed();
    });

    test('CJS', async () => {
      await createRunner(__dirname, 'fork.js').expect({ event: CHILD_EVENT }).start().completed();
    });
  });
});
