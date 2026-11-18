import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

const APP_NAME = 'astro-7';

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
    const serverPageRequestSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return getSpanOp(span) === 'http.server' && span.is_segment && span.name === 'GET /user-page/[userId]';
    });

    const response = await page.goto('/user-page/myUsername123');

    // Proves the request flowed through our custom `astro(state)` pipeline wrapper.
    expect(response?.headers()['x-astro-advanced-routing']).toBe('pipeline');

    const serverPageRequestSpan = await serverPageRequestSpanPromise;

    // The parametrized span name proves Sentry's auto-injected middleware ran inside the user-owned
    // pipeline AND resolved the dynamic segment to `[userId]` via Astro's route manifest (rather
    // than leaving the raw URL).
    expect(serverPageRequestSpan.attributes).toMatchObject({
      'sentry.origin': { value: 'auto.http.astro', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'url.full': { value: expect.stringContaining('/user-page/myUsername123'), type: 'string' },
    });
  });
});
