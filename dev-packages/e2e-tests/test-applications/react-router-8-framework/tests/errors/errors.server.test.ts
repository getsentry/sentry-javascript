import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { APP_NAME, RUNTIME } from '../constants';

test.describe('server-side errors', () => {
  test('captures error thrown in server loader', async ({ page }) => {
    const errorMessage = '¡Madre mía del server!';
    const errorPromise = waitForError(APP_NAME, async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === errorMessage;
    });

    await page.goto(`/errors/server-loader`);

    const error = await errorPromise;

    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: errorMessage,
            mechanism: {
              handled: false,
              type: 'react_router.loader',
            },
          },
        ],
      },
      transaction: 'GET /errors/server-loader',
      request: {
        url: expect.stringContaining('errors/server-loader'),
        headers: expect.any(Object),
      },
      level: 'error',
      // Only Node inits `@sentry/react-router`. Bun, Deno and Cloudflare init their runtime's own SDK.
      platform: RUNTIME === 'cloudflare' || RUNTIME === 'deno' ? 'javascript' : 'node',
      environment: 'qa',
      sdk: {
        integrations: expect.any(Array<string>),
        name: RUNTIME === 'node' ? 'sentry.javascript.react-router' : `sentry.javascript.${RUNTIME}`,
        version: expect.any(String),
      },
      ...(RUNTIME === 'node' ? { tags: { runtime: 'node' } } : {}),
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
        },
      },
    });
  });

  test('captures error thrown in server action', async ({ page }) => {
    const errorMessage = 'Madonna mia! Che casino nella Server Action!';
    const errorPromise = waitForError(APP_NAME, async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === errorMessage;
    });

    await page.goto(`/errors/server-action`);
    await page.locator('#submit').click();

    const error = await errorPromise;

    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: errorMessage,
            mechanism: {
              handled: false,
              type: 'react_router.action',
            },
          },
        ],
      },
      transaction: 'POST /errors/server-action',
      request: {
        url: expect.stringContaining('errors/server-action'),
        headers: expect.any(Object),
      },
      level: 'error',
      platform: RUNTIME === 'cloudflare' || RUNTIME === 'deno' ? 'javascript' : 'node',
      environment: 'qa',
      sdk: {
        integrations: expect.any(Array<string>),
        name: RUNTIME === 'node' ? 'sentry.javascript.react-router' : `sentry.javascript.${RUNTIME}`,
        version: expect.any(String),
      },
      ...(RUNTIME === 'node' ? { tags: { runtime: 'node' } } : {}),
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
        },
      },
    });
  });
});
