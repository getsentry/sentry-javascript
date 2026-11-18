import { HTTP_ROUTE } from '@sentry/conventions/attributes';
import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';

// `express` is a CommonJS package, and the app registers its route at module scope. workerd does not allow a
// channel publish there, so the SDK publishes the registration event with the first request.
it('names the request span after an Express route that is registered at module scope', async ({ signal }) => {
  const runner = createRunner(__dirname).ignore('event').start(signal);

  const spansPromise = runner.collectStreamedSpans(spansOfTrace => spansOfTrace.some(span => span.is_segment));

  await runner.makeRequest('get', '/users/123');

  const spans = await spansPromise;

  expect(spans.find(span => span.is_segment)).toEqual(
    expect.objectContaining({
      name: 'GET /users/:id',
      attributes: expect.objectContaining({
        [HTTP_ROUTE]: { type: 'string', value: '/users/:id' },
      }),
    }),
  );
});
