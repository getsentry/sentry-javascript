import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test.describe('client-side errors', () => {
  test('captures error thrown on click', async ({ page }) => {
    const errorEventPromise = waitForError('astro-4', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'client error';
    });

    await page.goto('/client-error');

    await page.getByText('Throw Error').click();

    const errorEvent = await errorEventPromise;

    const errorEventFrames = errorEvent.exception?.values?.[0]?.stacktrace?.frames;

    expect(errorEventFrames?.[errorEventFrames?.length - 1]).toEqual(
      expect.objectContaining({
        colno: expect.any(Number),
        lineno: expect.any(Number),
        filename: expect.stringContaining('/client-error'),
        function: 'HTMLButtonElement.onclick',
        in_app: true,
      }),
    );

    expect(errorEvent).toMatchObject({
      exception: {
        values: [
          {
            mechanism: {
              handled: false,
              type: 'auto.browser.global_handlers.onerror',
            },
            type: 'Error',
            value: 'client error',
            stacktrace: expect.any(Object), // detailed check above
          },
        ],
      },
      level: 'error',
      platform: 'javascript',
      request: {
        url: expect.stringContaining('/client-error'),
        headers: {
          'User-Agent': expect.any(String),
        },
      },
      event_id: expect.stringMatching(/[a-f0-9]{32}/),
      timestamp: expect.any(Number),
      sdk: {
        integrations: expect.arrayContaining([
          'InboundFilters',
          'FunctionToString',
          'BrowserApiErrors',
          'Breadcrumbs',
          'GlobalHandlers',
          'LinkedErrors',
          'Dedupe',
          'HttpContext',
          'BrowserSession',
          'BrowserTracing',
        ]),
        name: 'sentry.javascript.astro',
        version: expect.any(String),
        packages: expect.any(Array),
      },
      transaction: '/client-error',
      contexts: {
        trace: {
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
        },
      },
      environment: 'qa',
    });
  });
});
