import { _INTERNAL_MAX_FLAGS_PER_SPAN as MAX_FLAGS_PER_SPAN } from '@sentry/core';
import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('Flags captured on span attributes with max limit', async () => {
  // Based on scenario.ts.
  const expectedFlags: Record<string, { type: 'boolean'; value: boolean }> = {};
  for (let i = 1; i <= MAX_FLAGS_PER_SPAN; i++) {
    expectedFlags[`flag.evaluation.feat${i}`] = { type: 'boolean', value: i === 3 };
  }

  await createRunner(__dirname, 'scenario.ts')
    .expect({
      span: container => {
        const children = container.items.filter(span => !span.is_segment);
        expect(children).toHaveLength(2);
        expect(children).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'test-span',
              attributes: expect.objectContaining({}),
            }),
            expect.objectContaining({
              name: 'test-nested-span',
              attributes: expect.objectContaining(expectedFlags),
            }),
          ]),
        );
      },
    })
    .start()
    .completed();
});
