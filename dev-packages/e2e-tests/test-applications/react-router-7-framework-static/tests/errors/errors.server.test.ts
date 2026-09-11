import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

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
      // todo: should be 'GET /errors/server-loader'
      transaction: 'GET *',
      request: {
        url: expect.stringContaining('errors/server-loader'),
        headers: expect.any(Object),
      },
      level: 'error',
      platform: 'node',
      environment: 'qa',
      sdk: {
        integrations: expect.any(Array<string>),
        name: 'sentry.javascript.react-router',
        version: expect.any(String),
      },
      tags: { runtime: 'node' },
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
      // todo: should be 'POST /errors/server-action'
      transaction: 'POST *',
      request: {
        url: expect.stringContaining('errors/server-action'),
        headers: expect.any(Object),
      },
      level: 'error',
      platform: 'node',
      environment: 'qa',
      sdk: {
        integrations: expect.any(Array<string>),
        name: 'sentry.javascript.react-router',
        version: expect.any(String),
      },
      tags: { runtime: 'node' },
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
        },
      },
    });
  });
});
