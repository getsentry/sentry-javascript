import { expect, test } from '@playwright/test';
import { getRuntime } from '@sentry-internal/test-utils';
import { runManagedTunnelSuite } from '@sentry-internal/test-utils/tunnel-suite';

// On Nitro v2, `sentryCloudflareNitroPlugin` checks for a tunnel request before the SDK has a client, so it never
// passes the request body on and the app answers the tunnel instead.
test.fixme(getRuntime() === 'cloudflare', 'The managed tunnel is not served on Cloudflare yet');

test.beforeAll(async ({ request }) => {
  // `nuxt dev` opens the port before it's ready and answers 503 until then, and Playwright only waits for the port.
  await expect.poll(async () => (await request.get('/app/')).status(), { timeout: 30_000 }).not.toBe(503);
});

runManagedTunnelSuite({ appName: 'nuxt-4-tunnel', basePath: '/app' });
