import { expect, test } from '@playwright/test';

test('the served remix/ui runtime is instrumented', async ({ page, baseURL }) => {
  const served: string[] = [];
  page.on('response', response => {
    if (response.request().resourceType() === 'script') {
      served.push(response.url());
    }
  });

  await page.goto('/', { waitUntil: 'load' });

  const runModule = served.find(url => /@remix-run\/ui\/dist\/runtime\/run\.js/.test(decodeURIComponent(url)));
  expect(runModule, 'run.js was not served').toBeDefined();

  const code = await (await fetch(runModule as string)).text();
  expect(code).toMatch(/diagnosticsChannelShim\.js/);
  // A CommonJS `require` here would mean the transform emitted the wrong module type.
  expect(code).not.toMatch(/\brequire\(/);
});
