import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

function hasUrlPath(span: { attributes: Record<string, { value: unknown }> }, path: string): boolean {
  return `${span.attributes['url.full']?.value}`.includes(path);
}

test('attributes fetch spans to their originating microfrontend', async ({ page }) => {
  const spansPromise = collectStreamedSpans('browser-mfe-vite', spans => {
    const httpSpans = spans.filter(span => getSpanOp(span) === 'http.client');

    return ['/api/header-data', '/api/mfe-one-data', '/api/shell-config'].every(path =>
      httpSpans.some(span => hasUrlPath(span, path)),
    );
  });

  await page.goto('/');

  const spans = await spansPromise;
  const httpSpans = spans.filter(span => getSpanOp(span) === 'http.client');

  // MFE spans carry the mfe.name attribute set via withScope + spanStart hook
  const headerSpan = httpSpans.find(span => hasUrlPath(span, '/api/header-data'));
  const mfeOneSpan = httpSpans.find(span => hasUrlPath(span, '/api/mfe-one-data'));
  const shellSpan = httpSpans.find(span => hasUrlPath(span, '/api/shell-config'));

  expect(headerSpan).toBeDefined();
  expect(mfeOneSpan).toBeDefined();
  expect(shellSpan).toBeDefined();

  expect(headerSpan?.attributes['mfe.name']).toEqual({ value: 'mfe-header', type: 'string' });
  expect(mfeOneSpan?.attributes['mfe.name']).toEqual({ value: 'mfe-one', type: 'string' });

  // Shell span has no MFE tag
  expect(shellSpan?.attributes['mfe.name']).toBeUndefined();
});
