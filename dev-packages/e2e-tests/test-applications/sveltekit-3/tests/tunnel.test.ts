import { expect, test } from '@playwright/test';
import { waitForError, watchForTunnelSpan } from '@sentry-internal/test-utils';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';

test.skip(!process.env.E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

const APP_NAME = 'sveltekit-3';
const TUNNEL_PATH = /^\/app\/[a-z0-9]{1,7}$/;

// Kit's own `sveltekit.handle.root` span starts with only `http.url`, no `url.path`.
function getSpanPath(span: SerializedStreamedSpan): string {
  const url = String(span.attributes['http.url']?.value ?? span.attributes['url.path']?.value ?? '');

  return url.startsWith('http') ? new URL(url).pathname : url;
}

test('sends client events through the managed tunnel under the base path, without spans of it', async ({ page }) => {
  const errorEventPromise = waitForError(APP_NAME, event => event?.exception?.values?.[0]?.value === 'Click Error');
  const raceTunnelSpan = watchForTunnelSpan(APP_NAME, span => TUNNEL_PATH.test(getSpanPath(span)));

  // The pageload envelope is the first tunnel request, and it's only sent once the app hydrated.
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );
  await page.goto('/app/client-error');

  expect((await tunnelResponsePromise).status()).toBe(200);

  await page.getByText('Throw error').click();
  await expect(errorEventPromise).resolves.toBeDefined();

  expect(
    await raceTunnelSpan(
      span => getSpanPath(span).endsWith('/app/users/123'),
      () => page.request.get('/app/users/123'),
    ),
  ).toBe('anchor');
});
