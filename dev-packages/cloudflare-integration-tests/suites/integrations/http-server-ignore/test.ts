import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

it('Does not capture body for ignored URLs (health check)', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Record<string, unknown>;
      expect(event.message).toBe('Health check');
      // Body should NOT be captured because URL contains /health
      expect((event.request as Record<string, unknown>).data).toBeUndefined();
    })
    .start(signal);

  await runner.makeRequest('post', '/health', {
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({ status: 'checking' }),
  });

  await runner.completed();
});

it('Does not capture body for ignored URLs (upload)', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Record<string, unknown>;
      expect(event.message).toBe('Upload request');
      // Body should NOT be captured because URL contains /upload
      expect((event.request as Record<string, unknown>).data).toBeUndefined();
    })
    .start(signal);

  await runner.makeRequest('post', '/upload', {
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({ file: 'large-data' }),
  });

  await runner.completed();
});

it('Captures body for non-ignored URLs', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Record<string, unknown>;
      expect(event.message).toBe('API request');
      // Body SHOULD be captured because URL does not match ignore pattern
      expect((event.request as Record<string, unknown>).data).toBe('{"action":"submit"}');
    })
    .start(signal);

  await runner.makeRequest('post', '/api', {
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({ action: 'submit' }),
  });

  await runner.completed();
});
