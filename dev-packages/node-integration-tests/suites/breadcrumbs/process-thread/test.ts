import type { Event } from '@sentry/core';
import { afterAll, expect, test } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

const EVENT = {
  // and an exception that is our ANR
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
    {
      timestamp: expect.any(Number),
      category: 'worker_thread',
      message: "Worker thread errored with 'Worker error'",
      level: 'error',
      data: {
        threadId: expect.any(Number),
      },
    },
  ],
};

conditionalTest({ min: 20 })('should capture process and thread breadcrumbs', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('ESM', async () => {
    await createRunner(__dirname, 'app.mjs')
      .withMockSentryServer()
      .expect({ event: EVENT as Event })
      .start()
      .completed();
  });
});
