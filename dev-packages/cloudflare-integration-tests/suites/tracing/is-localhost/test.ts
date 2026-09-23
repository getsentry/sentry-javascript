import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

it('sets sentry.is_localhost on every streamed span', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const items = envelope[1].filter(item => item[0].type === 'span').flatMap(item => (item[1] as any).items);

      expect(items.length).toBeGreaterThan(0);
      expect(items.some((s: any) => s.is_segment)).toBe(true);
      expect(items.some((s: any) => s.name === 'child-span')).toBe(true);

      for (const span of items) {
        expect(span.attributes['sentry.is_localhost']).toEqual({ type: 'boolean', value: true });
      }
    })
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();
});
