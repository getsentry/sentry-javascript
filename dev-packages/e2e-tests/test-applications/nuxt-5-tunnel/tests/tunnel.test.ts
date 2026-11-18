import { expect, test } from '@playwright/test';
import { runManagedTunnelSuite } from '@sentry-internal/test-utils/tunnel-suite';

test.beforeAll(async ({ request }) => {
  // `nuxt dev` opens the port before it's ready and answers 503 until then, and Playwright only waits for the port.
  await expect.poll(async () => (await request.get('/app/')).status(), { timeout: 30_000 }).not.toBe(503);
});

runManagedTunnelSuite({ appName: 'nuxt-5-tunnel', basePath: '/app' });
