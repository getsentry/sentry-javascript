import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

it('Does not capture request body when maxRequestBodySize is none', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Record<string, unknown>;
      expect(event.message).toBe('POST with disabled body capture');
      expect(event.request).toEqual(
        expect.objectContaining({
          method: 'POST',
          url: expect.any(String),
        }),
      );
      // Body should NOT be captured
      expect((event.request as Record<string, unknown>).data).toBeUndefined();
    })
    .start(signal);

  await runner.makeRequest('post', '/', {
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({ secret: 'should-not-be-captured' }),
  });

  await runner.completed();
});
