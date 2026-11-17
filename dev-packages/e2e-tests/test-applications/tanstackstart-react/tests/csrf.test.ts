import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page, Request } from '@playwright/test';

async function captureServerFnRequest(page: Page): Promise<Request> {
  const serverFnRequestPromise = page.waitForRequest(request =>
    new URL(request.url()).pathname.startsWith('/_serverFn/'),
  );

  await page.goto('/test-serverFn');
  await page.locator('html[data-hydrated="true"]').waitFor();
  await page.getByText('Call server function', { exact: true }).click();

  return serverFnRequestPromise;
}

async function replayWithFetchSite(request: APIRequestContext, serverFnRequest: Request, fetchSite: string) {
  return request.fetch(serverFnRequest.url(), {
    method: serverFnRequest.method(),
    headers: { ...(await serverFnRequest.allHeaders()), 'sec-fetch-site': fetchSite },
    data: serverFnRequest.postDataBuffer() ?? undefined,
  });
}

test('Blocks a cross-site server function request', async ({ page, request }) => {
  const serverFnRequest = await captureServerFnRequest(page);

  const response = await replayWithFetchSite(request, serverFnRequest, 'cross-site');

  expect(response.status()).toBe(403);
});

test('Allows a same-origin server function request', async ({ page, request }) => {
  const serverFnRequest = await captureServerFnRequest(page);

  const response = await replayWithFetchSite(request, serverFnRequest, 'same-origin');

  expect(response.status()).toBe(200);
});

test('Does not block a cross-site request to a server route', async ({ request }) => {
  const response = await request.get('/api/user/123', { headers: { 'sec-fetch-site': 'cross-site' } });

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ id: '123' });
});
