import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test.describe('server-side errors', () => {
  test('captures SSR error', async ({ page }) => {
    const errorEventPromise = waitForError('astro-4', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === "Cannot read properties of undefined (reading 'x')";
    });

    await page.goto('/ssr-error');

    const errorEvent = await errorEventPromise;

    expect(errorEvent).toMatchObject({
      contexts: {
        app: expect.any(Object),
        cloud_resource: expect.any(Object),
        culture: expect.any(Object),
        device: expect.any(Object),
        os: expect.any(Object),
        runtime: expect.any(Object),
        trace: {
          span_id: '', //TODO: This is a bug! We should expect.stringMatching(/[a-f0-9]{16}/) instead of ''
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        },
      },
      environment: 'qa',
      event_id: expect.stringMatching(/[a-f0-9]{32}/),
      exception: {
        values: [
          {
            mechanism: {
              data: {
                function: 'astroMiddleware',
              },
              handled: false,
              type: 'astro',
            },
            stacktrace: expect.any(Object),
            type: 'TypeError',
            value: "Cannot read properties of undefined (reading 'x')",
          },
        ],
      },
      platform: 'node',
      request: {
        cookies: {},
        headers: expect.objectContaining({
          // demonstrates that requestData integration is getting data
          host: 'localhost:3030',
          'user-agent': expect.any(String),
        }),
        method: 'GET',
        url: expect.stringContaining('/ssr-error'),
      },
      sdk: {
        integrations: expect.any(Array),
        name: 'sentry.javascript.astro',
        packages: expect.any(Array),
        version: expect.any(String),
      },
      server_name: expect.any(String),
      timestamp: expect.any(Number),
      transaction: 'GET /ssr-error',
    });
  });

  test('captures endpoint error', async ({ page }) => {
    const errorEventPromise = waitForError('astro-4', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Endpoint Error';
    });

    await page.goto('/endpoint-error');
    await page.getByText('Get Data').click();

    const errorEvent = await errorEventPromise;

    expect(errorEvent).toMatchObject({
      contexts: {
        trace: {
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        },
      },
      exception: {
        values: [
          {
            mechanism: {
              data: {
                function: 'astroMiddleware',
              },
              handled: false,
              type: 'astro',
            },
            stacktrace: expect.any(Object),
            type: 'Error',
            value: 'Endpoint Error',
          },
        ],
      },
      platform: 'node',
      request: {
        cookies: {},
        headers: expect.objectContaining({
          accept: expect.any(String),
        }),
        method: 'GET',
        query_string: 'error=1',
        url: expect.stringContaining('endpoint-error/api?error=1'),
      },
      transaction: 'GET /endpoint-error/api',
    });
  });
});
