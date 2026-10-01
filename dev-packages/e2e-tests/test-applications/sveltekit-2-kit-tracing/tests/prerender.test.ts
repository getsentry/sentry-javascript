import { expect, test } from '@playwright/test';

test("Doesn't add trace meta tags to prerendered pages", async ({ request }) => {
  const prerenderedHtml = await (await request.get('/prerendered')).text();
  const ssrHtml = await (await request.get('/')).text();

  expect(prerenderedHtml).toContain('Prerendered page');
  expect(prerenderedHtml).not.toContain('<meta name="sentry-trace"');
  expect(prerenderedHtml).not.toContain('<meta name="baggage"');

  // SSR pages still get the meta tags
  expect(ssrHtml).toContain('<meta name="sentry-trace"');
  expect(ssrHtml).toContain('<meta name="baggage"');
});
