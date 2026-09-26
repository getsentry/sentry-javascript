import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

const DEBUG_ID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

function getDebugId(code: string): string | undefined {
  return code.match(new RegExp(`\\n//# debugId=(${DEBUG_ID})$`))?.[1];
}

test('every served browser module carries a debug ID', async ({ page, baseURL }) => {
  const moduleUrls: string[] = [];
  page.on('response', response => {
    if (response.request().resourceType() === 'script' && response.url().startsWith(`${baseURL}/assets/`)) {
      moduleUrls.push(response.url());
    }
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  expect(moduleUrls).toContainEqual(expect.stringContaining('/assets/app/actions/public/entry.ts'));

  for (const url of moduleUrls) {
    const code = await (await fetch(url)).text();
    const debugId = getDebugId(code);

    expect(debugId, `${url} has no debugId comment`).toBeDefined();
    expect(code).toContain(`sentry-dbid-${debugId}`);
  }
});

// The app does not configure source maps, so they are hidden, like the other meta framework SDKs do.
test('source maps are not exposed when the app did not ask for them', async ({ baseURL }) => {
  const url = `${baseURL}/assets/app/actions/public/entry.ts`;

  const code = await (await fetch(url)).text();
  const sourceMapResponse = await fetch(`${url}.map`);

  expect(code).not.toContain('//# sourceMappingURL=');
  expect(sourceMapResponse.status).toBe(404);
});

test('the debug ID of a module is stable across requests', async ({ baseURL }) => {
  const url = `${baseURL}/assets/app/actions/public/throw-error.ts`;

  const first = getDebugId(await (await fetch(url)).text());
  const second = getDebugId(await (await fetch(url)).text());

  expect(first).toMatch(new RegExp(`^${DEBUG_ID}$`));
  expect(second).toBe(first);
});

test('a client error carries the debug IDs of the modules in its stack trace', async ({ page, baseURL }) => {
  const errorPromise = waitForError('remix-v3', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Remix 3 client error';
  });

  await page.goto('/');
  await page.locator('#throw-error').click();

  const errorEvent = await errorPromise;

  const moduleUrl = `${baseURL}/assets/app/actions/public/throw-error.ts`;
  const debugId = getDebugId(await (await fetch(moduleUrl)).text());

  expect(errorEvent.debug_meta?.images).toContainEqual({
    type: 'sourcemap',
    code_file: moduleUrl,
    debug_id: debugId,
  });
});
