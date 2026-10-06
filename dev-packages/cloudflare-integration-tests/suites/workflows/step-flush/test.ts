import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

it('sends the span of a step before the Workflow goes to sleep', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const container = envelope[1].find(item => item[0].type === 'span')?.[1] as SerializedStreamedSpanContainer;

      expect(container.items).toHaveLength(1);
      expect(container.items[0]!.name).toBe('before-sleep');
      expect(envelope[0].trace).toEqual({
        environment: 'production',
        public_key: 'public',
        trace_id: container.items[0]!.trace_id,
        transaction: 'before-sleep',
        sampled: 'true',
        sample_rand: expect.any(String),
        sample_rate: '1',
      });
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/workflow/trigger');
  await runner.completed();
});
