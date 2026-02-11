import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import type { EventAndTraceHeader } from '../../../../utils/helpers';
import {
  eventAndTraceHeaderRequestParser,
  getFirstSentryEnvelopeRequest,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

const META_TAG_TRACE_ID = '12345678901234567890123456789012';
const META_TAG_PARENT_SPAN_ID = '1234567890123456';
const META_TAG_BAGGAGE =
  'sentry-trace_id=12345678901234567890123456789012,sentry-public_key=public,sentry-release=1.0.0,sentry-environment=prod,sentry-sample_rand=0.42';

sentryTest('error on initial page has traceId from meta tag', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const errorEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    undefined,
    eventAndTraceHeaderRequestParser,
  );

  await page.locator('#errorBtn').click();
  const [errorEvent, errorTraceHeader] = await errorEventPromise;

  expect(errorEvent.type).toEqual(undefined);
  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: META_TAG_TRACE_ID,
    parent_span_id: META_TAG_PARENT_SPAN_ID,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });

  expect(errorTraceHeader).toEqual({
    environment: 'prod',
    public_key: 'public',
    release: '1.0.0',
    trace_id: META_TAG_TRACE_ID,
    sample_rand: '0.42',
  });
});

sentryTest('error has new traceId after navigation', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const errorEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    undefined,
    eventAndTraceHeaderRequestParser,
  );
  await page.locator('#errorBtn').click();
  const [errorEvent, errorTraceHeader] = await errorEventPromise;

  expect(errorEvent.type).toEqual(undefined);
  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: META_TAG_TRACE_ID,
    parent_span_id: META_TAG_PARENT_SPAN_ID,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });

  expect(errorTraceHeader).toEqual({
    environment: 'prod',
    public_key: 'public',
    release: '1.0.0',
    trace_id: META_TAG_TRACE_ID,
    sample_rand: expect.any(String),
  });

  const errorEventPromise2 = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    `${url}#navigation`,
    eventAndTraceHeaderRequestParser,
  );
  await page.locator('#errorBtn').click();
  const [errorEvent2, errorTraceHeader2] = await errorEventPromise2;

  expect(errorEvent2.contexts?.trace).toEqual({
    trace_id: expect.stringMatching(/^[\da-f]{32}$/),
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });

  expect(errorTraceHeader2).toEqual({
    environment: 'production',
    public_key: 'public',
    trace_id: errorEvent2.contexts?.trace?.trace_id,
  });

  expect(errorEvent2.contexts?.trace?.trace_id).not.toBe(META_TAG_TRACE_ID);
});

sentryTest('outgoing fetch requests have new traceId after navigation', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.route('http://sentry-test-site.example/**', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.goto(url);

  const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
  await page.locator('#fetchBtn').click();
  const request = await requestPromise;
  const headers = request.headers();

  // sampling decision is deferred because TwP means we didn't sample any span
  // eslint-disable-next-line regexp/prefer-d
  expect(headers['sentry-trace']).toMatch(new RegExp(`^${META_TAG_TRACE_ID}-[0-9a-f]{16}$`));
  expect(headers['baggage']).toBe(META_TAG_BAGGAGE);

  await page.goto(`${url}#navigation`);

  const requestPromise2 = page.waitForRequest('http://sentry-test-site.example/*');
  await page.locator('#fetchBtn').click();
  const request2 = await requestPromise2;
  const headers2 = request2.headers();

  // sampling decision is deferred because TwP means we didn't sample any span
  expect(headers2['sentry-trace']).toMatch(/^[\da-f]{32}-[\da-f]{16}$/);
  expect(headers2['baggage']).not.toBe(`${META_TAG_TRACE_ID}-${META_TAG_PARENT_SPAN_ID}`);
  expect(headers2['baggage']).toMatch(
    /sentry-environment=production,sentry-public_key=public,sentry-trace_id=[\da-f]{32}/,
  );
  expect(headers2['baggage']).not.toContain(`sentry-trace_id=${META_TAG_TRACE_ID}`);
});

sentryTest('outgoing XHR requests have new traceId after navigation', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.route('http://sentry-test-site.example/**', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.goto(url);

  const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
  await page.locator('#xhrBtn').click();
  const request = await requestPromise;
  const headers = request.headers();

  // sampling decision is deferred because TwP means we didn't sample any span
  // eslint-disable-next-line regexp/prefer-d
  expect(headers['sentry-trace']).toMatch(new RegExp(`^${META_TAG_TRACE_ID}-[0-9a-f]{16}$`));
  expect(headers['baggage']).toBe(META_TAG_BAGGAGE);

  await page.goto(`${url}#navigation`);

  const requestPromise2 = page.waitForRequest('http://sentry-test-site.example/*');
  await page.locator('#xhrBtn').click();
  const request2 = await requestPromise2;
  const headers2 = request2.headers();

  // sampling decision is deferred because TwP means we didn't sample any span
  expect(headers2['sentry-trace']).toMatch(/^[\da-f]{32}-[\da-f]{16}$/);
  expect(headers2['baggage']).not.toBe(`${META_TAG_TRACE_ID}-${META_TAG_PARENT_SPAN_ID}`);
  expect(headers2['baggage']).toMatch(
    /sentry-environment=production,sentry-public_key=public,sentry-trace_id=[\da-f]{32}/,
  );
  expect(headers2['baggage']).not.toContain(`sentry-trace_id=${META_TAG_TRACE_ID}`);
});
