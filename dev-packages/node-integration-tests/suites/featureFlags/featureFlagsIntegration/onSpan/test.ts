import { _INTERNAL_MAX_FLAGS_PER_SPAN as MAX_FLAGS_PER_SPAN } from '@sentry/core';
import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('Flags captured on span attributes with max limit', async () => {
  // Based on scenario.ts.
  const expectedFlags: Record<string, boolean> = {};
  for (let i = 1; i <= MAX_FLAGS_PER_SPAN; i++) {
    expectedFlags[`flag.evaluation.feat${i}`] = i === 3;
  }

  await createRunner(__dirname, 'scenario.ts')
    .expect({
      transaction: {
        spans: [
          expect.objectContaining({
            description: 'test-span',
            data: expect.objectContaining({}),
          }),
          expect.objectContaining({
            description: 'test-nested-span',
            data: expect.objectContaining(expectedFlags),
          }),
        ],
      },
    })
    .start()
    .completed();
});
