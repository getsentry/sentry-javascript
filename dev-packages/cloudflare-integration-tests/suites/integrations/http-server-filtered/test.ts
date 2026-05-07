import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

it('Does not capture request body when httpServerIntegration is filtered out', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Record<string, unknown>;
      expect(event.message).toBe('POST with filtered integration');
      expect(event.request).toEqual(
        expect.objectContaining({
          method: 'POST',
          url: expect.any(String),
        }),
      );
      // Body should NOT be captured when integration is filtered out
      expect((event.request as Record<string, unknown>).data).toBeUndefined();
    })
    .start(signal);

  await runner.makeRequest('post', '/', {
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({ secret: 'should-not-be-captured' }),
  });

  await runner.completed();
});
