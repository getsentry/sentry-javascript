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
              type: 'react-router',
            },
          },
        ],
      },
      // Express names the transaction on Node and Deno. Without an Express layer (Cloudflare, and Bun, where
      // Express is not instrumented under `bun run`) it stays the request path.
      // todo: should be 'GET /errors/server-loader' everywhere
      transaction: RUNTIME === 'cloudflare' || RUNTIME === 'bun' ? 'GET /errors/server-loader' : 'GET /{*splat}',
      request: {
        url: expect.stringContaining('errors/server-loader'),
        headers: expect.any(Object),
      },
      level: 'error',
      platform: RUNTIME === 'cloudflare' ? 'javascript' : 'node',
      environment: 'qa',
      sdk: {
        integrations: expect.any(Array<string>),
        name: RUNTIME === 'cloudflare' ? 'sentry.javascript.cloudflare' : 'sentry.javascript.react-router',
        version: expect.any(String),
      },
      ...(RUNTIME === 'cloudflare' ? {} : { tags: { runtime: 'node' } }),
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
              type: 'react-router',
            },
          },
        ],
      },
      // Express names the transaction on Node and Deno. Without an Express layer (Cloudflare, and Bun, where
      // Express is not instrumented under `bun run`) it stays the request path.
      // todo: should be 'POST /errors/server-action' everywhere
      transaction: RUNTIME === 'cloudflare' || RUNTIME === 'bun' ? 'POST /errors/server-action.data' : 'POST /{*splat}',
      request: {
        url: expect.stringContaining('errors/server-action'),
        headers: expect.any(Object),
      },
      level: 'error',
      platform: RUNTIME === 'cloudflare' ? 'javascript' : 'node',
      environment: 'qa',
      sdk: {
        integrations: expect.any(Array<string>),
        name: RUNTIME === 'cloudflare' ? 'sentry.javascript.cloudflare' : 'sentry.javascript.react-router',
        version: expect.any(String),
      },
      ...(RUNTIME === 'cloudflare' ? {} : { tags: { runtime: 'node' } }),
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
        },
      },
    });
  });
});
