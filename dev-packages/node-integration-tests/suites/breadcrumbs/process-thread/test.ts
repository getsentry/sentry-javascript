import type { Event } from '@sentry/types';
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
      message: 'Child process spawned',
      level: 'info',
      data: {
        spawnfile: 'sleep',
      },
    },
    {
      timestamp: expect.any(Number),
      category: 'child_process',
      message: "Child process exited with code '0'",
      level: 'info',
      data: {
        spawnfile: 'sleep',
      },
    },
    {
      timestamp: expect.any(Number),
      category: 'worker_thread',
      message: 'Worker thread online',
      level: 'info',
      data: {
        threadId: expect.any(Number),
      },
    },
    {
      timestamp: expect.any(Number),
      category: 'worker_thread',
      message: "Worker thread exited with code '0'",
      level: 'info',
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

  test('ESM', done => {
    createRunner(__dirname, 'app.mjs')
      .withMockSentryServer()
      .expect({ event: EVENT as Event })
      .start(done);
  });
});
