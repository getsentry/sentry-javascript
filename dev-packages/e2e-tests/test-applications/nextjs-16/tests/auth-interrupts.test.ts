import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { isVinext } from './isVinext';

const cases = [
  { kind: 'forbidden', label: 'Forbidden', status: 403, statusMessage: 'permission_denied' },
  { kind: 'unauthorized', label: 'Unauthorized', status: 401, statusMessage: 'unauthenticated' },
] as const;

function waitForAuthInterruptError(status: number): Promise<unknown> {
  return waitForError('nextjs-16', errorEvent => {
    return JSON.stringify(errorEvent.exception ?? {}).includes(`NEXT_HTTP_ERROR_FALLBACK;${status}`);
  });
}

// The error would be sent in the same flush as the spans, so a short grace period is enough.
async function expectNoError(errorPromise: Promise<unknown>): Promise<void> {
  const result = await Promise.race([
    errorPromise.then(() => 'error'),
    new Promise(resolve => setTimeout(() => resolve('timeout'), 2000)),
  ]);
  expect(result).toBe('timeout');
}

for (const { kind, label, status, statusMessage } of cases) {
  test(`Does not capture ${kind}() in a server component and marks the render span`, async ({ page }) => {
    const errorPromise = waitForAuthInterruptError(status);
    const spansPromise = collectStreamedSpansUntilSegment('nextjs-16', `GET /auth-interrupts/${kind}`);

    const response = await page.goto(`/auth-interrupts/${kind}`);
    expect(response?.status()).toBe(status);

    const spans = await spansPromise;
    const segmentSpan = spans.find(span => span.is_segment)!;
    expect(segmentSpan.status).toBe('error');
    expect(segmentSpan.attributes['http.response.status_code']?.value).toBe(status);

    // Server components are only wrapped by our webpack loader, so only webpack builds set a status on the render span.
    // vinext builds with neither webpack nor Turbopack.
    if (!segmentSpan.attributes['turbopack'] && !isVinext) {
      expect(spans).toContainEqual(
        expect.objectContaining({
          name: `render route (app) /auth-interrupts/${kind}`,
          status: 'error',
          attributes: expect.objectContaining({
            'sentry.status.message': { value: statusMessage, type: 'string' },
          }),
        }),
      );
    }

    await expectNoError(errorPromise);
  });

  test(`Does not capture ${kind}() in a server action and marks the action span`, async ({ page }) => {
    test.skip(isVinext, `vinext rethrows ${kind}() of a server action in the browser, where it is an uncaught error`);

    const errorPromise = waitForAuthInterruptError(status);
    const spanPromise = waitForStreamedSpan('nextjs-16', span => {
      return span.name === `${kind}ServerAction` && span.is_segment;
    });

    await page.goto('/auth-interrupts/server-action');
    await page.getByText(`Run ${label} Action`).click();

    const span = await spanPromise;
    expect(span.status).toBe('error');
    expect(span.attributes['sentry.status.message']?.value).toBe(statusMessage);

    await expectNoError(errorPromise);
  });

  test(`Does not capture ${kind}() in a route handler and sets the response status`, async ({ request }) => {
    const errorPromise = waitForAuthInterruptError(status);
    const spanPromise = waitForStreamedSpan('nextjs-16', span => {
      return span.name === `GET /auth-interrupts/route-handler/${kind}` && span.is_segment;
    });

    const response = await request.get(`/auth-interrupts/route-handler/${kind}`);
    expect(response.status()).toBe(status);

    const span = await spanPromise;
    expect(span.status).toBe('error');
    expect(span.attributes['sentry.status.message']?.value).toBe(statusMessage);
    expect(span.attributes['http.response.status_code']?.value).toBe(status);

    await expectNoError(errorPromise);
  });
}
