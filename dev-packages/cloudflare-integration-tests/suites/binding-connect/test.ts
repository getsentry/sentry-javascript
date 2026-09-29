import type { Envelope, SerializedStreamedSpanContainer } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';

it('calls connect() on Durable Object stubs and service bindings with the binding as `this`', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect((envelope: Envelope) => {
      const spanItem = envelope[1].find(item => item[0].type === 'span');
      expect(spanItem).toBeDefined();
      const segmentSpan = (spanItem![1] as SerializedStreamedSpanContainer).items.find(span => !!span.is_segment);
      expect(segmentSpan).toMatchObject({
        name: 'GET',
        status: 'ok',
        attributes: expect.objectContaining({ 'url.path': { type: 'string', value: '/connect' } }),
      });
    })
    .start(signal);

  const result = await runner.makeRequest<{ durableObject: string; service: string }>('get', '/connect');

  expect(result?.durableObject).toBe('ok');
  // Local workerd rejects CONNECT on a Worker after the `this` check, so only that check is asserted here.
  expect(result?.service).not.toMatch(/Illegal invocation/);
  await runner.completed();
});
