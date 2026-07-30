import type { Event } from '@sentry/core';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

const WORKER_ERROR_EVENT = {
  exception: {
    values: [
      {
        type: 'Error',
        value: 'Worker error',
        mechanism: {
          type: 'auto.worker_thread',
          handled: false,
        },
      },
    ],
  },
};

const TEST_ERROR_EVENT = {
  exception: {
    values: [
      {
        type: 'Error',
        value: 'This is a test error',
      },
    ],
  },
  breadcrumbs: [
    {
      timestamp: expect.any(Number),
      category: 'child_process',
      message: "Child process exited with code '1'",
      level: 'warning',
      data: {
        spawnfile: 'sleep',
      },
    },
  ],
};

conditionalTest({ min: 20 })('should capture child process breadcrumbs and worker thread errors', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('ESM', async () => {
    await createRunner(__dirname, 'app.mjs')
      .withMockSentryServer()
      .expect({ event: WORKER_ERROR_EVENT as Event })
      .expect({ event: TEST_ERROR_EVENT as Event })
      .unordered()
      .start()
      .completed();
  });
});
