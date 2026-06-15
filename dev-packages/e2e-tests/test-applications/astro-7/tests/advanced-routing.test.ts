import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// Astro 7 "advanced routing": the app owns the request pipeline via `src/fetch.ts`.
// These tests verify Sentry behaves correctly both when the app delegates to
// Astro's full pipeline and when it short-circuits a request entirely.
test.describe('astro 7 advanced routing (src/fetch.ts)', () => {
  test("handles a fully custom route outside Astro's pipeline", async ({ request }) => {
    const response = await request.get('/fetch-custom');

    expect(response.status()).toBe(200);
    expect(await response.text()).toBe('handled-by-fetch-entrypoint');
    // The custom branch in `src/fetch.ts` ran (Astro's pipeline was bypassed).
    expect(response.headers()['x-astro-advanced-routing']).toBe('custom');
  });

  test('Sentry middleware still parametrizes routes when run through the full pipeline', async ({ page }) => {
    // Hit a dynamic route so we exercise the actual URL -> route parametrization
    // (`/user-page/myUsername123` -> `/user-page/[userId]`), not just a static route name.
    const serverPageRequestTxnPromise = waitForTransaction('astro-7', txnEvent => {
      return txnEvent?.transaction === 'GET /user-page/[userId]';
    });

    const response = await page.goto('/user-page/myUsername123');

    // Proves the request flowed through our custom `astro(state)` pipeline wrapper.
    expect(response?.headers()['x-astro-advanced-routing']).toBe('pipeline');

    const serverPageRequestTxn = await serverPageRequestTxnPromise;

    // The parametrized transaction name proves Sentry's auto-injected middleware
    // ran inside the user-owned pipeline AND resolved the dynamic segment to
    // `[userId]` via Astro's route manifest (rather than leaving the raw URL).
    expect(serverPageRequestTxn.transaction).toBe('GET /user-page/[userId]');
    expect(serverPageRequestTxn.contexts?.trace).toMatchObject({
      op: 'http.server',
      origin: 'auto.http.astro',
      data: expect.objectContaining({
        'sentry.source': 'route',
        url: expect.stringContaining('/user-page/myUsername123'),
      }),
    });
  });
});
