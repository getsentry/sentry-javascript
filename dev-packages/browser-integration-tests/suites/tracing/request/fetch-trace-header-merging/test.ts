import type { Page, Request } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

async function assertRequests({
  page,
  buttonSelector,
  requestMatcher,
}: {
  page: Page;
  buttonSelector: string;
  requestMatcher: string;
}) {
  const requests = await new Promise<Request[]>(resolve => {
    const requests: Request[] = [];
    page
      .route(requestMatcher, (route, request) => {
        requests.push(request);
        if (requests.length === 2) {
          resolve(requests);
        }

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      })
      .then(() => {
        page.click(buttonSelector);
      });
  });

  expect(requests).toHaveLength(2);

  requests.forEach(request => {
    const headers = request.headers();

    // No merged sentry trace headers
    expect(headers['sentry-trace']).not.toContain(',');

    // No multiple baggage entries
    expect(headers['baggage'].match(/sentry-release/g) ?? []).toHaveLength(1);
  });
}

sentryTest(
  'Ensure the SDK does not infinitely append tracing headers to outgoing requests',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    await sentryTest.step('fetch with POJO', () =>
      assertRequests({
        page,
        buttonSelector: '#fetchPojo',
        requestMatcher: 'http://sentry-test-site.example/fetch-pojo',
      }),
    );

    await sentryTest.step('fetch with array', () =>
      assertRequests({
        page,
        buttonSelector: '#fetchArray',
        requestMatcher: 'http://sentry-test-site.example/fetch-array',
      }),
    );

    await sentryTest.step('fetch with Headers instance', () =>
      assertRequests({
        page,
        buttonSelector: '#fetchHeaders',
        requestMatcher: 'http://sentry-test-site.example/fetch-headers',
      }),
    );
  },
);
