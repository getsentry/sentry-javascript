import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

it('Captures request body under 1000 bytes with maxRequestBodySize: small', async ({ signal }) => {
  const smallBody = JSON.stringify({ data: 'x'.repeat(100) });

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Record<string, unknown>;
      expect(event.message).toBe('Small body request');
      expect((event.request as Record<string, unknown>).data).toBe(smallBody);
    })
    .start(signal);

  await runner.makeRequest('post', '/small-body', {
    headers: { 'content-type': 'application/json' },
    data: smallBody,
  });

  await runner.completed();
});

it('Truncates request body over 1000 bytes with maxRequestBodySize: small', async ({ signal }) => {
  const largeBody = JSON.stringify({ data: 'x'.repeat(2000) });

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Record<string, unknown>;
      expect(event.message).toBe('Large body request');
      const capturedBody = (event.request as Record<string, unknown>).data as string;
      // Body should be truncated to ~1000 bytes + "..."
      expect(capturedBody).toBeDefined();
      expect(capturedBody.endsWith('...')).toBe(true);
      expect(capturedBody.length).toBeLessThanOrEqual(1000);
    })
    .start(signal);

  await runner.makeRequest('post', '/large-body', {
    headers: { 'content-type': 'application/json' },
    data: largeBody,
  });

  await runner.completed();
});
