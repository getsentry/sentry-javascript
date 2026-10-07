import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import type { EventAndTraceHeader } from '../../../../utils/helpers';
import {
  eventAndTraceHeaderRequestParser,
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  shouldSkipFeedbackTest,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest(
  'should create a new trace for a navigation after the initial pageload',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const [pageloadEvent, pageloadTraceHeaders] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      url,
      eventAndTraceHeaderRequestParser,
    );
    const [navigationEvent, navigationTraceHeaders] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      `${url}#foo`,
      eventAndTraceHeaderRequestParser,
    );

    const pageloadTraceContext = pageloadEvent.contexts?.trace;
    const navigationTraceContext = navigationEvent.contexts?.trace;

    expect(pageloadEvent.type).toEqual('transaction');
    expect(navigationEvent.type).toEqual('transaction');

    expect(pageloadTraceContext).toMatchObject({
      op: 'pageload',
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });
    expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

    expect(pageloadTraceHeaders).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: pageloadTraceContext?.trace_id,
      sample_rand: expect.any(String),
    });

    expect(navigationTraceContext).toMatchObject({
      op: 'navigation',
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });
    expect(navigationTraceContext).not.toHaveProperty('parent_span_id');

    expect(navigationTraceHeaders).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: navigationTraceContext?.trace_id,
      sample_rand: expect.any(String),
    });

    expect(pageloadTraceContext?.span_id).not.toEqual(navigationTraceContext?.span_id);
  },
);

sentryTest('error after pageload has pageload traceId', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const [pageloadEvent, pageloadTraceHeader] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    url,
    eventAndTraceHeaderRequestParser,
  );
  const pageloadTraceContext = pageloadEvent.contexts?.trace;

  expect(pageloadEvent.type).toEqual('transaction');
  expect(pageloadTraceContext).toMatchObject({
    op: 'pageload',
    trace_id: expect.stringMatching(/^[\da-f]{32}$/),
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });
  expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

  expect(pageloadTraceHeader).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: pageloadTraceContext?.trace_id,
    sample_rand: expect.any(String),
  });

  const errorEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    undefined,
    eventAndTraceHeaderRequestParser,
  );
  await page.locator('#errorBtn').click();
  const [errorEvent, errorTraceHeader] = await errorEventPromise;

  const errorTraceContext = errorEvent.contexts?.trace;
  expect(errorEvent.type).toEqual(undefined);

  expect(errorTraceContext).toEqual({
    trace_id: pageloadTraceContext?.trace_id,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });

  expect(errorTraceHeader).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: pageloadTraceContext?.trace_id,
    sample_rand: expect.any(String),
  });
});

sentryTest('error during pageload has pageload traceId', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const envelopeRequestsPromise = getMultipleSentryEnvelopeRequests<EventAndTraceHeader>(
    page,
    2,
    undefined,
    eventAndTraceHeaderRequestParser,
  );
  await page.goto(url);
  await page.locator('#errorBtn').click();
  const envelopes = await envelopeRequestsPromise;

  const [pageloadEvent, pageloadTraceHeader] = envelopes.find(
    eventAndHeader => eventAndHeader[0].type === 'transaction',
  )!;
  const [errorEvent, errorTraceHeader] = envelopes.find(eventAndHeader => !eventAndHeader[0].type)!;

  const pageloadTraceContext = pageloadEvent?.contexts?.trace;

  expect(pageloadEvent.type).toEqual('transaction');
  expect(pageloadTraceContext).toMatchObject({
    op: 'pageload',
    trace_id: expect.stringMatching(/^[\da-f]{32}$/),
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });
  expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

  expect(pageloadTraceHeader).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: pageloadTraceContext?.trace_id,
    sample_rand: expect.any(String),
  });

  const errorTraceContext = errorEvent?.contexts?.trace;

  expect(errorEvent.type).toEqual(undefined);
  expect(errorTraceContext).toEqual({
    trace_id: pageloadTraceContext?.trace_id,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });

  expect(errorTraceHeader).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: pageloadTraceContext?.trace_id,
    sample_rand: expect.any(String),
  });
});

sentryTest(
  'outgoing fetch request during pageload has pageload traceId in headers',
  async ({ getLocalTestUrl, page }) => {
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

    const pageloadEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      undefined,
      eventAndTraceHeaderRequestParser,
    );
    const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
    await page.goto(url);
    await page.locator('#fetchBtn').click();
    const [[pageloadEvent, pageloadTraceHeader], request] = await Promise.all([pageloadEventPromise, requestPromise]);

    const pageloadTraceContext = pageloadEvent.contexts?.trace;
    const pageloadTraceId = pageloadTraceContext?.trace_id;

    expect(pageloadEvent.type).toEqual('transaction');
    expect(pageloadTraceContext).toMatchObject({
      op: 'pageload',
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });
    expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

    expect(pageloadTraceHeader).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: pageloadTraceId,
      sample_rand: expect.any(String),
    });

    const headers = request.headers();

    // sampling decision is propagated from active span sampling decision
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${pageloadTraceId}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toBe(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${pageloadTraceId},sentry-sampled=true,sentry-sample_rand=${pageloadTraceHeader?.sample_rand},sentry-sample_rate=1`,
    );
  },
);

sentryTest(
  'outgoing XHR request during pageload has pageload traceId in headers',
  async ({ getLocalTestUrl, page }) => {
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

    const pageloadEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      undefined,
      eventAndTraceHeaderRequestParser,
    );
    const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
    await page.goto(url);
    await page.locator('#xhrBtn').click();
    const [[pageloadEvent, pageloadTraceHeader], request] = await Promise.all([pageloadEventPromise, requestPromise]);

    const pageloadTraceContext = pageloadEvent.contexts?.trace;
    const pageloadTraceId = pageloadTraceContext?.trace_id;

    expect(pageloadEvent.type).toEqual('transaction');
    expect(pageloadTraceContext).toMatchObject({
      op: 'pageload',
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });
    expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

    expect(pageloadTraceHeader).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: pageloadTraceId,
      sample_rand: expect.any(String),
    });

    const headers = request.headers();

    // sampling decision is propagated from active span sampling decision
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${pageloadTraceId}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toBe(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${pageloadTraceId},sentry-sampled=true,sentry-sample_rand=${pageloadTraceHeader?.sample_rand},sentry-sample_rate=1`,
    );
  },
);

// sentryTest(
//   'outgoing fetch request after pageload has pageload traceId in headers',
//   async ({ getLocalTestUrl, page }) => {
//     if (shouldSkipTracingTest()) {
//       sentryTest.skip();
//     }

//     const url = await getLocalTestUrl({ testDir: __dirname });

//     await page.route('http://sentry-test-site.example/**', route => {
//       return route.fulfill({
//         status: 200,
//         contentType: 'application/json',
//         body: JSON.stringify({}),
//       });
//     });

//     const pageloadEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
//       page,
//       undefined,
//       eventAndTraceHeaderRequestParser,
//     );
//     await page.goto(url);
//     const [pageloadEvent, pageloadTraceHeader] = await pageloadEventPromise;

//     const pageloadTraceContext = pageloadEvent.contexts?.trace;
//     const pageloadTraceId = pageloadTraceContext?.trace_id;

//     expect(pageloadEvent.type).toEqual('transaction');
//     expect(pageloadTraceContext).toMatchObject({
//       op: 'pageload',
//       trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
//       span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
//     });
//     expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

//     expect(pageloadTraceHeader).toEqual({
//       environment: 'production',
//       public_key: 'public',
//       sample_rate: '1',
//       sampled: 'true',
//       trace_id: pageloadTraceId,
//     });

//     const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
//     await page.locator('#xhrBtn').click();
//     const request = await requestPromise;

//     const headers = request.headers();

//     // sampling decision is propagated from active span sampling decision
//     expect(headers['sentry-trace']).toMatch(new RegExp(`^${pageloadTraceId}-[0-9a-f]{16}-1$`));
//     expect(headers['baggage']).toEqual(
//       `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${pageloadTraceId},sentry-sample_rate=1,sentry-sampled=true`,
//     );
//   },
// )

// sentryTest(
//   'custom span and request headers after pageload have pageload traceId ',
//   async ({ getLocalTestUrl, page }) => {
//     if (shouldSkipTracingTest()) {
//       sentryTest.skip();
//     }

//     const url = await getLocalTestUrl({ testDir: __dirname });

//     await page.route('http://sentry-test-site.example/**', route => {
//       return route.fulfill({
//         status: 200,
//         contentType: 'application/json',
//         body: JSON.stringify({}),
//       });
//     });

//     const pageloadEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
//       page,
//       undefined,
//       eventAndTraceHeaderRequestParser,
//     );

//     await page.goto(url);

//     const [pageloadEvent, pageloadTraceHeader] = await pageloadEventPromise;

//     const pageloadTraceContext = pageloadEvent.contexts?.trace;
//     const pageloadTraceId = pageloadTraceContext?.trace_id;

//     expect(pageloadEvent.type).toEqual('transaction');
//     expect(pageloadTraceContext).toMatchObject({
//       op: 'pageload',
//       trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
//       span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
//     });
//     expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

//     expect(pageloadTraceHeader).toEqual({
//       environment: 'production',
//       public_key: 'public',
//       sample_rate: '1',
//       sampled: 'true',
//       trace_id: pageloadTraceId,
//     });

//     const requestPromise = page.waitForRequest('http://sentry-test-site.example/**');
//     const customTransactionEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
//       page,
//       undefined,
//       eventAndTraceHeaderRequestParser,
//     );

//     await page.locator('#spanAndFetchBtn').click();

//     const [[customTransactionEvent, customTransactionTraceHeader], request] = await Promise.all([
//       customTransactionEventPromise,
//       requestPromise,
//     ]);

//     const customTransactionTraceContext = customTransactionEvent.contexts?.trace;

//     expect(customTransactionEvent.type).toEqual('transaction');
//     expect(customTransactionTraceContext).toMatchObject({
//       trace_id: pageloadTraceId,
//     });

//     expect(customTransactionTraceHeader).toEqual({
//       environment: 'production',
//       public_key: 'public',
//       sample_rate: '1',
//       sampled: 'true',
//       trace_id: pageloadTraceId,
//     });

//     const headers = request.headers();

//     // sampling decision is propagated from active span sampling decision
//     expect(headers['sentry-trace']).toMatch(new RegExp(`^${pageloadTraceId}-[0-9a-f]{16}-1$`));
//     expect(headers['baggage']).toEqual(
//       `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${pageloadTraceId},sentry-sample_rate=1,sentry-sampled=true`,
//     );
//   },
// );

sentryTest('user feedback event after pageload has pageload traceId in headers', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest() || shouldSkipFeedbackTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname, handleLazyLoadedFeedback: true });

  const pageloadEvent = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const pageloadTraceContext = pageloadEvent.contexts?.trace;

  expect(pageloadTraceContext).toMatchObject({
    op: 'pageload',
    trace_id: expect.stringMatching(/^[\da-f]{32}$/),
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });
  expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

  const feedbackEventPromise = getFirstSentryEnvelopeRequest<Event>(page);

  await page.getByText('Report a Bug').click();
  expect(await page.locator(':visible:text-is("Report a Bug")').count()).toEqual(1);
  await page.locator('[name="name"]').fill('Jane Doe');
  await page.locator('[name="email"]').fill('janedoe@example.org');
  await page.locator('[name="message"]').fill('my example feedback');
  await page.locator('[data-sentry-feedback] .btn--primary').click();

  const feedbackEvent = await feedbackEventPromise;

  expect(feedbackEvent.type).toEqual('feedback');

  const feedbackTraceContext = feedbackEvent.contexts?.trace;

  expect(feedbackTraceContext).toMatchObject({
    trace_id: pageloadTraceContext?.trace_id,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });
});
