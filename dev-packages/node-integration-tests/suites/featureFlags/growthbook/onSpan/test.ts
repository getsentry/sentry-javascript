import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('GrowthBook flags are added to active span attributes on span end', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .unordered()
    .expect({
      span: container => {
        expect(container.items).toHaveLength(1);
        const span = container.items.find(item => item.is_segment);
        expect(span).toMatchObject({
          name: 'test-span',
          status: 'ok',
          span_id: expect.stringMatching(/[a-f\d]{16}/),
          trace_id: expect.stringMatching(/[a-f\d]{32}/),
          attributes: {
            'flag.evaluation.feat1': { type: 'boolean', value: true },
            'flag.evaluation.feat2': { type: 'boolean', value: false },
            'flag.evaluation.bool-feat': { type: 'boolean', value: true },
            'sentry.op': { type: 'string', value: 'function' },
            'sentry.origin': { type: 'string', value: 'manual' },
          },
        });
        // string-feat should NOT be here since it's not boolean
        expect(span?.attributes['flag.evaluation.string-feat']).toBeUndefined();
      },
    })
    .start()
    .completed();
});
