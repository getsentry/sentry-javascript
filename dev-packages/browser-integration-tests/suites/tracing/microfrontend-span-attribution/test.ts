import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../utils/helpers';

sentryTest('should attribute spans to their originating microfrontend', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: '{}' }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  const reqPromise = waitForTransactionRequest(page, event => {
    const spans = event.spans || [];
    return (
      spans.some(s => s.description?.includes('/api/todos/1')) &&
      spans.some(s => s.description?.includes('/api/todos/2')) &&
      spans.some(s => s.description?.includes('/api/todos/3')) &&
      spans.some(s => s.description?.includes('/api/shell-config'))
    );
  });

  await page.goto(url);

  const req = await reqPromise;
  const event = envelopeRequestParser(req);
  const httpSpans = event.spans?.filter(({ op }) => op === 'http.client') || [];

  // Each MFE's fetch is attributed via withScope + spanStart hook
  expect(httpSpans.find(s => s.description?.includes('/api/todos/1'))?.data?.['mfe.name']).toBe('mfe-header');
  expect(httpSpans.find(s => s.description?.includes('/api/todos/2'))?.data?.['mfe.name']).toBe('mfe-one');
  expect(httpSpans.find(s => s.description?.includes('/api/todos/3'))?.data?.['mfe.name']).toBe('mfe-two');

  // Shell span has no MFE tag
  expect(httpSpans.find(s => s.description?.includes('/api/shell-config'))?.data?.['mfe.name']).toBeUndefined();
});
