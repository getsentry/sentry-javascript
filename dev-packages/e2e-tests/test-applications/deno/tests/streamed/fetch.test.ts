import { expect, test } from '@playwright/test';
import { waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Outbound fetch inside Sentry span creates streamed span', async ({ baseURL }) => {
  const spanPromise = waitForStreamedSpan('deno', span => span.name === 'test-outgoing-fetch');

  await fetch(`${baseURL}/test-outgoing-fetch`);

  const span = await spanPromise;

  expect(span).toEqual(
    expect.objectContaining({
      name: 'test-outgoing-fetch',
      is_segment: false,
      attributes: expect.objectContaining({
        'sentry.origin': { type: 'string', value: 'manual' },
      }),
    }),
  );
});
