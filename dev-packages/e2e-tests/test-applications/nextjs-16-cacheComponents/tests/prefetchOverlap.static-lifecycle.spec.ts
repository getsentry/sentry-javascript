import { expect, test } from '@playwright/test';

const REQUEST_COUNT = 12;

// Next.js aborts a Cache Components prerender when randomness is generated while it runs. On Cloudflare Workers the
// SDK used to generate it inside the prerender of another request once prefetches overlapped, which turned their
// responses into the one byte partial marker `~` (https://github.com/getsentry/sentry-javascript/issues/25245).
test('overlapping runtime prefetch requests render their pages', async ({ request }) => {
  // `Next-Router-Prefetch: 2` is what the Next.js router sends for a runtime prefetch, which Next.js answers with a
  // prerender at request time.
  const responses = await Promise.all(
    Array.from({ length: REQUEST_COUNT }, (_, index) =>
      request.get(`/prefetch-overlap/overlap-${index + 1}`, { headers: { RSC: '1', 'Next-Router-Prefetch': '2' } }),
    ),
  );

  for (const [index, response] of responses.entries()) {
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain(`prefetched overlap-${index + 1}`);
  }
});
