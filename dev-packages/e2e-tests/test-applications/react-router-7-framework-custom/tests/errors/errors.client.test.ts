import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('client-side errors', () => {
  const errorMessage = '¡Madre mía!';
  test('captures error thrown on click', async ({ page }) => {
    const errorPromise = waitForError(APP_NAME, async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === errorMessage;
    });

    await page.goto(`/errors/client`);
    await page.locator('#throw-on-click').click();

    const error = await errorPromise;

    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: errorMessage,
            mechanism: {
              handled: false,
            },
          },
        ],
      },
      transaction: '/errors/client',
      request: {
        url: expect.stringContaining('errors/client'),
        headers: expect.any(Object),
      },
      level: 'error',
      platform: 'javascript',
      environment: 'qa',
      sdk: {
        integrations: expect.any(Array<string>),
        name: 'sentry.javascript.react-router',
        version: expect.any(String),
      },
      tags: { runtime: 'browser' },
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
        },
      },
      breadcrumbs: [
        {
          category: 'ui.click',
          message: 'body > div > button#throw-on-click',
        },
      ],
    });
  });

  test('captures error thrown on click from a parameterized route', async ({ page }) => {
    const errorMessage = '¡Madre mía de churros!';
    const errorPromise = waitForError(APP_NAME, async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === errorMessage;
    });

    await page.goto('/errors/client/churros');
    await page.locator('#throw-on-click').click();

    const error = await errorPromise;

    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: '¡Madre mía de churros!',
            mechanism: {
              handled: false,
            },
          },
        ],
      },
      // todo: should be '/errors/client/:client-param'
      transaction: '/errors/client/churros',
    });
  });

  test('captures error thrown in a clientLoader', async ({ page }) => {
    const errorMessage = '¡Madre mía del client loader!';
    const errorPromise = waitForError(APP_NAME, async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === errorMessage;
    });

    await page.goto('/errors/client-loader');

    const error = await errorPromise;

    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: errorMessage,
            mechanism: {
              handled: true,
            },
          },
        ],
      },
      transaction: '/errors/client-loader',
    });
  });

  test('captures error thrown in a clientAction', async ({ page }) => {
    const errorMessage = 'Madonna mia! Che casino nella Client Action!';
    const errorPromise = waitForError(APP_NAME, async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === errorMessage;
    });

    await page.goto('/errors/client-action');
    await page.locator('#submit').click();

    const error = await errorPromise;

    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: errorMessage,
            mechanism: {
              handled: true,
            },
          },
        ],
      },
      transaction: '/errors/client-action',
    });
  });
});
