import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';
import { createCjsTests } from '../../../utils/runner/createEsmAndCjsTests';

describe('lru-memoizer', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('keeps outer context inside the memoized inner functions', async () => {
      await createTestRunner()
        .expect({
          span: container => {
            expect(container.items.find(item => item.is_segment)).toMatchObject({
              name: 'test-name',
              attributes: expect.objectContaining({
                'sentry.op': { type: 'string', value: 'run' },
                'sentry.origin': { type: 'string', value: 'manual' },
                'memoized.context_preserved': { type: 'boolean', value: true },
              }),
            });
          },
        })
        .start()
        .completed();
    });
  });

  // CJS-only: the parallel scenario is flaky in ESM (see #21729).
  createCjsTests(__dirname, 'scenario-parallel.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('keeps each span context across parallel memoized requests', async () => {
      // Both root spans share the isolation scope's trace, so they are flushed in one envelope.
      // Each callback must have run in its own span's context.
      await createTestRunner()
        .expect({
          span: container => {
            const segmentSpans = container.items.filter(item => item.is_segment);
            expect(segmentSpans.map(span => span.attributes['sentry.op']?.value).sort()).toEqual(['first', 'second']);
            for (const span of segmentSpans) {
              expect(span.attributes['memoized.context_preserved']).toEqual({ type: 'boolean', value: true });
            }
          },
        })
        .start()
        .completed();
    });
  });
});
