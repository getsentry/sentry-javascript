import type { APIRequestContext } from '@playwright/test';
import { CODE_FUNCTION_NAME, SENTRY_DESCRIPTION, SENTRY_ORIGIN, URL_PATH } from '@sentry/conventions/attributes';
import { CACHE_PUT, DB_QUERY, FUNCTION, MIDDLEWARE } from '@sentry/conventions/op';
import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { isViteServer, NITRO_ONLY } from './isViteServer';
import { DB_ORIGIN } from './runtime';

const DATA_ORIGIN = 'auto.function.nuxt.data';
const STORAGE_ORIGIN = 'auto.cache.nuxt';

const hasOrigin = (origin: string) => (span: SerializedStreamedSpan) =>
  span.attributes[SENTRY_ORIGIN]?.value === origin;

/**
 * Requests the page and returns the spans of that request. On Cloudflare, the spans of one request can arrive in more
 * than one envelope and in any order, so each test names the spans that it waits for.
 */
async function requestPage(
  request: APIRequestContext,
  hasSpansUnderTest: (spans: SerializedStreamedSpan[]) => boolean,
): Promise<SerializedStreamedSpan[]> {
  const spansPromise = collectStreamedSpans(
    'nuxt-4',
    spans =>
      spans.some(span => span.is_segment && span.attributes[URL_PATH]?.value === '/data-fetching') &&
      hasSpansUnderTest(spans),
  );

  await request.get('/data-fetching');

  return spansPromise;
}

/** On the Vite server, the fetch of an API route renders a page inside the data span, so the name alone is not enough. */
function getPageRenderSpan(spans: SerializedStreamedSpan[]): SerializedStreamedSpan | undefined {
  const rootSpan = spans.find(span => span.is_segment);

  return spans.find(span => span.name === 'renderPage' && span.parent_span_id === rootSpan?.span_id);
}

/** The spans of the two `useFetch` calls of the page. */
function getFetchSpans(spans: SerializedStreamedSpan[]): SerializedStreamedSpan[] {
  return spans.filter(span => hasOrigin(DATA_ORIGIN)(span) && span.name === 'useAsyncData');
}

const hasBothFetchSpans = (spans: SerializedStreamedSpan[]) => getFetchSpans(spans).length >= 2;
const getSpanIds = (spans: SerializedStreamedSpan[]) => spans.map(span => span.span_id).sort();
const getParentSpanIds = (spans: SerializedStreamedSpan[]) => spans.map(span => span.parent_span_id).sort();

test('sends a span for `useLazyAsyncData` as a child of the render span', async ({ request }) => {
  const spans = await requestPage(
    request,
    spans => !!getPageRenderSpan(spans) && spans.some(span => span.name === 'useLazyAsyncData'),
  );

  const lazySpans = spans.filter(span => span.name === 'useLazyAsyncData');

  expect(lazySpans).toHaveLength(1);
  expect(lazySpans[0]?.status).toBe('ok');
  expect(lazySpans[0]?.parent_span_id).toBe(getPageRenderSpan(spans)?.span_id);
  expect(getSpanOp(lazySpans[0]!)).toBe(FUNCTION);
  expect(lazySpans[0]?.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: DATA_ORIGIN });
  expect(lazySpans[0]?.attributes[CODE_FUNCTION_NAME]).toEqual({ type: 'string', value: 'useLazyAsyncData' });
  expect(lazySpans[0]?.attributes[SENTRY_DESCRIPTION]).toEqual({ type: 'string', value: 'order-count' });
});

// A production build of Nuxt sends the name of the composable only for `useLazyAsyncData`.
test('names the span of a `useFetch` call `useAsyncData`', async ({ request }) => {
  const spans = await requestPage(request, spans => spans.filter(hasOrigin(DATA_ORIGIN)).length >= 3);

  const dataSpans = spans.filter(hasOrigin(DATA_ORIGIN));

  expect(dataSpans.map(span => span.name).sort()).toEqual(['useAsyncData', 'useAsyncData', 'useLazyAsyncData']);
  expect(dataSpans.map(span => span.attributes[CODE_FUNCTION_NAME]?.value).sort()).toEqual([
    'useAsyncData',
    'useAsyncData',
    'useLazyAsyncData',
  ]);
});

test('adds the key as the description only for a `useFetch` call with a key', async ({ request }) => {
  const spans = await requestPage(request, hasBothFetchSpans);

  const descriptions = getFetchSpans(spans).map(span => span.attributes[SENTRY_DESCRIPTION]?.value);

  expect(descriptions).toHaveLength(2);
  expect(descriptions).toContain('visits');
  expect(descriptions).toContain(undefined);
});

test('makes each `useFetch` span a child of the render span', async ({ request }) => {
  const spans = await requestPage(request, spans => !!getPageRenderSpan(spans) && hasBothFetchSpans(spans));

  const renderSpanId = getPageRenderSpan(spans)?.span_id;

  expect(getParentSpanIds(getFetchSpans(spans))).toEqual([renderSpanId, renderSpanId]);
});

test.describe('spans of the API route that a `useFetch` call fetches on the server', () => {
  test.skip(isViteServer, NITRO_ONLY);

  test('makes the storage span a child of the `useFetch` span', async ({ request }) => {
    const spans = await requestPage(
      request,
      spans => hasBothFetchSpans(spans) && spans.filter(hasOrigin(STORAGE_ORIGIN)).length >= 2,
    );

    const storageSpans = spans.filter(hasOrigin(STORAGE_ORIGIN));

    expect(getParentSpanIds(storageSpans)).toEqual(getSpanIds(getFetchSpans(spans)));
    expect(storageSpans.map(span => span.name)).toEqual(['cache.put', 'cache.put']);
    expect(storageSpans.map(getSpanOp)).toEqual([CACHE_PUT, CACHE_PUT]);
  });

  test('makes the database span a child of the `useFetch` span', async ({ request }) => {
    const spans = await requestPage(
      request,
      spans => hasBothFetchSpans(spans) && spans.filter(hasOrigin(DB_ORIGIN)).length >= 2,
    );

    const dbSpans = spans.filter(hasOrigin(DB_ORIGIN));

    expect(getParentSpanIds(dbSpans)).toEqual(getSpanIds(getFetchSpans(spans)));
    expect(dbSpans.map(span => span.name)).toEqual(['CREATE TABLE visits', 'CREATE TABLE visits']);
    expect(dbSpans.map(getSpanOp)).toEqual([DB_QUERY, DB_QUERY]);
  });

  // The server middleware runs for the page request and for each fetch of the API route.
  test('makes the server middleware spans children of the `useFetch` span', async ({ request }) => {
    const getMiddlewareNames = (spans: SerializedStreamedSpan[], parentSpanId: string | undefined) =>
      spans
        .filter(span => getSpanOp(span) === MIDDLEWARE && span.parent_span_id === parentSpanId)
        .map(span => `${span.name} (${span.attributes[SENTRY_ORIGIN]?.value})`)
        .sort();
    const getMiddlewareNamesOfPage = (spans: SerializedStreamedSpan[]) =>
      getMiddlewareNames(spans, spans.find(span => span.is_segment)?.span_id);
    const getMiddlewareNamesOfFetches = (spans: SerializedStreamedSpan[]) =>
      getFetchSpans(spans).map(fetchSpan => getMiddlewareNames(spans, fetchSpan.span_id));
    const spans = await requestPage(
      request,
      spans =>
        hasBothFetchSpans(spans) &&
        getMiddlewareNamesOfFetches(spans).every(names => names.length >= getMiddlewareNamesOfPage(spans).length),
    );

    const namesOfPage = getMiddlewareNamesOfPage(spans);

    expect(namesOfPage.length).toBeGreaterThan(0);
    expect(namesOfPage.every(name => name.endsWith('(auto.middleware.nuxt)'))).toBe(true);
    expect(getMiddlewareNamesOfFetches(spans)).toEqual([namesOfPage, namesOfPage]);
  });
});
