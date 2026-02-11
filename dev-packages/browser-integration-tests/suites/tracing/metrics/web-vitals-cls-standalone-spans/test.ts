import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { observeV2Span, waitForSpanV2Envelope, waitForV2Span } from '../../../../utils/spanFirstUtils';

sentryTest.beforeEach(async ({ browserName, page }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.setViewportSize({ width: 800, height: 1200 });
});

function waitForLayoutShift(page: Page): Promise<void> {
  return page.evaluate(() => {
    return new Promise(resolve => {
      window.addEventListener('cls-done', () => resolve());
    });
  });
}

function triggerAndWaitForLayoutShift(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('trigger-cls'));
    return new Promise(resolve => {
      window.addEventListener('cls-done', () => resolve());
    });
  });
}

function hidePage(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
}

sentryTest('captures a "GOOD" CLS vital with its source as a standalone span', async ({ getLocalTestUrl, page }) => {
  const spanEnvelopePromise = waitForSpanV2Envelope(
    page,
    spanEnvelope =>
      !!spanEnvelope[1]?.[0]?.[1]?.items?.find(i => i.attributes?.['sentry.op']?.value === 'ui.webvital.cls'),
  );

  const pageloadSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'pageload');

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(`${url}#0.05`);

  await waitForLayoutShift(page);

  await hidePage(page);

  const pageloadSpan = await pageloadSpanPromise;
  const spanEnvelope = await spanEnvelopePromise;

  const clsSpanEnvelopeHeaders = spanEnvelope[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];

  const clsSpan = spanEnvelopeItem.items.find(i => i.attributes?.['sentry.op']?.value === 'ui.webvital.cls');

  expect(clsSpan?.trace_id).toEqual(pageloadSpan.trace_id);

  expect(clsSpan).toEqual({
    attributes: {
      'sentry.exclusive_time': { value: 0, type: 'integer' },
      'sentry.op': { value: 'ui.webvital.cls', type: 'string' },
      'sentry.origin': { value: 'auto.http.browser.cls', type: 'string' },
      'sentry.report_event': { value: 'pagehide', type: 'string' },
      transaction: { value: expect.stringContaining('index.html'), type: 'string' },

      'user_agent.original': { value: expect.stringContaining('Chrome'), type: 'string' },

      'http.request.header.user_agent': {
        type: 'string',
        value: expect.stringContaining('Chrome'),
      },

      'sentry.pageload.span_id': { value: expect.stringMatching(/[a-f\d]{16}/), type: 'string' },

      'browser.web_vital.cls.value': { value: expect.any(Number), type: 'double' },
      cls: { value: expect.any(Number), type: 'double' },

      'browser.web_vital.cls.source.1': { value: expect.stringContaining('body > div#content > p'), type: 'string' },

      'sentry.sdk.name': {
        type: 'string',
        value: 'sentry.javascript.browser',
      },
      'sentry.sdk.version': {
        type: 'string',
        value: expect.any(String),
      },
      'sentry.segment.id': {
        type: 'string',
        value: clsSpan?.span_id,
      },
      'sentry.segment.name': {
        type: 'string',
        value: expect.stringContaining('body > div#content > p'),
      },
      'sentry.source': {
        type: 'string',
        value: 'custom',
      },
      'sentry.span.source': {
        type: 'string',
        value: 'custom',
      },
      'url.full': {
        type: 'string',
        value: 'http://sentry-test.io/index.html#0.05',
      },
    },
    name: expect.stringContaining('body > div#content > p'),
    span_id: expect.stringMatching(/[a-f\d]{16}/),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    trace_id: pageloadSpan.trace_id,
    status: 'ok',
    is_segment: true,
  });

  const clsValue = clsSpan?.attributes?.['browser.web_vital.cls.value']?.value;

  // Flakey value dependent on timings -> we check for a range
  expect(clsValue).toBeGreaterThan(0.03);
  expect(clsValue).toBeLessThan(0.07);

  expect(clsSpanEnvelopeHeaders).toEqual({
    sent_at: expect.any(String),
    trace: {
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: pageloadSpan.trace_id,
      sample_rand: expect.any(String),
    },
    sdk: {
      name: 'sentry.javascript.browser',
      packages: [
        {
          name: 'npm:@sentry/browser',
          version: expect.any(String),
        },
      ],
      settings: {
        infer_ip: 'never',
      },
      version: expect.any(String),
    },
  });
});

sentryTest('captures a "MEH" CLS vital with its source as a standalone span', async ({ getLocalTestUrl, page }) => {
  const clsSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'ui.webvital.cls');

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(`${url}#0.21`);

  await waitForLayoutShift(page);

  // Page hide to trigger CLS emission
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });

  const clsSpan = await clsSpanPromise;

  expect(clsSpan).toEqual({
    attributes: {
      'sentry.exclusive_time': { value: 0, type: 'integer' },
      'sentry.op': { value: 'ui.webvital.cls', type: 'string' },
      'sentry.origin': { value: 'auto.http.browser.cls', type: 'string' },
      'sentry.report_event': { value: 'pagehide', type: 'string' },
      transaction: { value: expect.stringContaining('index.html'), type: 'string' },

      'user_agent.original': { value: expect.stringContaining('Chrome'), type: 'string' },

      'http.request.header.user_agent': {
        type: 'string',
        value: expect.stringContaining('Chrome'),
      },

      'sentry.pageload.span_id': { value: expect.stringMatching(/[a-f\d]{16}/), type: 'string' },

      'browser.web_vital.cls.value': { value: expect.any(Number), type: 'double' },
      cls: { value: expect.any(Number), type: 'double' },

      'browser.web_vital.cls.source.1': { value: expect.stringContaining('body > div#content > p'), type: 'string' },

      'sentry.sdk.name': {
        type: 'string',
        value: 'sentry.javascript.browser',
      },
      'sentry.sdk.version': {
        type: 'string',
        value: expect.any(String),
      },
      'sentry.segment.id': {
        type: 'string',
        value: clsSpan?.span_id,
      },
      'sentry.segment.name': {
        type: 'string',
        value: expect.stringContaining('body > div#content > p'),
      },
      'sentry.source': {
        type: 'string',
        value: 'custom',
      },
      'sentry.span.source': {
        type: 'string',
        value: 'custom',
      },
      'url.full': {
        type: 'string',
        value: 'http://sentry-test.io/index.html#0.21',
      },
    },
    name: expect.stringContaining('body > div#content > p'),
    span_id: expect.stringMatching(/[a-f\d]{16}/),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f\d]{32}/),
    status: 'ok',
    is_segment: true,
  });

  const clsValue = clsSpan?.attributes?.['browser.web_vital.cls.value']?.value;

  // Flakey value dependent on timings -> we check for a range
  expect(clsValue).toBeGreaterThan(0.18);
  expect(clsValue).toBeLessThan(0.23);
});

sentryTest('captures a "POOR" CLS vital with its source as a standalone span.', async ({ getLocalTestUrl, page }) => {
  const clsSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'ui.webvital.cls');

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(`${url}#0.35`);

  await waitForLayoutShift(page);

  // Page hide to trigger CLS emission
  await hidePage(page);

  const clsSpan = await clsSpanPromise;

  expect(clsSpan).toEqual({
    attributes: {
      'sentry.exclusive_time': { value: 0, type: 'integer' },
      'sentry.op': { value: 'ui.webvital.cls', type: 'string' },
      'sentry.origin': { value: 'auto.http.browser.cls', type: 'string' },
      'sentry.report_event': { value: 'pagehide', type: 'string' },
      transaction: { value: expect.stringContaining('index.html'), type: 'string' },

      'user_agent.original': { value: expect.stringContaining('Chrome'), type: 'string' },

      'http.request.header.user_agent': {
        type: 'string',
        value: expect.stringContaining('Chrome'),
      },

      'sentry.pageload.span_id': { value: expect.stringMatching(/[a-f\d]{16}/), type: 'string' },

      'browser.web_vital.cls.value': { value: expect.any(Number), type: 'double' },
      cls: { value: expect.any(Number), type: 'double' },

      'browser.web_vital.cls.source.1': { value: expect.stringContaining('body > div#content > p'), type: 'string' },

      'sentry.sdk.name': {
        type: 'string',
        value: 'sentry.javascript.browser',
      },
      'sentry.sdk.version': {
        type: 'string',
        value: expect.any(String),
      },
      'sentry.segment.id': {
        type: 'string',
        value: clsSpan?.span_id,
      },
      'sentry.segment.name': {
        type: 'string',
        value: expect.stringContaining('body > div#content > p'),
      },
      'sentry.source': {
        type: 'string',
        value: 'custom',
      },
      'sentry.span.source': {
        type: 'string',
        value: 'custom',
      },
      'url.full': {
        type: 'string',
        value: 'http://sentry-test.io/index.html#0.35',
      },
    },
    name: expect.stringContaining('body > div#content > p'),
    span_id: expect.stringMatching(/[a-f\d]{16}/),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f\d]{32}/),
    status: 'ok',
    is_segment: true,
  });

  const clsValue = clsSpan?.attributes?.['browser.web_vital.cls.value']?.value;

  // Flakey value dependent on timings -> we check for a range
  expect(clsValue).toBeGreaterThan(0.33);
  expect(clsValue).toBeLessThan(0.38);
});

sentryTest(
  'captures a 0 CLS vital as a standalone span if no layout shift occurred',
  async ({ getLocalTestUrl, page }) => {
    const clsSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'ui.webvital.cls');

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    await page.waitForTimeout(1000);

    await hidePage(page);

    const clsSpan = await clsSpanPromise;

    expect(clsSpan).toEqual({
      attributes: {
        'sentry.exclusive_time': { value: 0, type: 'integer' },
        'sentry.op': { value: 'ui.webvital.cls', type: 'string' },
        'sentry.origin': { value: 'auto.http.browser.cls', type: 'string' },
        'sentry.report_event': { value: 'pagehide', type: 'string' },
        transaction: { value: expect.stringContaining('index.html'), type: 'string' },

        'user_agent.original': { value: expect.stringContaining('Chrome'), type: 'string' },

        'http.request.header.user_agent': {
          type: 'string',
          value: expect.stringContaining('Chrome'),
        },

        'sentry.pageload.span_id': { value: expect.stringMatching(/[a-f\d]{16}/), type: 'string' },

        'browser.web_vital.cls.value': { value: expect.any(Number), type: 'integer' },
        cls: { value: expect.any(Number), type: 'integer' },

        'sentry.sdk.name': {
          type: 'string',
          value: 'sentry.javascript.browser',
        },
        'sentry.sdk.version': {
          type: 'string',
          value: expect.any(String),
        },
        'sentry.segment.id': {
          type: 'string',
          value: clsSpan?.span_id,
        },
        'sentry.segment.name': {
          type: 'string',
          value: expect.stringContaining('Layout shift'),
        },
        'sentry.source': {
          type: 'string',
          value: 'custom',
        },
        'sentry.span.source': {
          type: 'string',
          value: 'custom',
        },
        'url.full': {
          type: 'string',
          value: 'http://sentry-test.io/index.html',
        },
      },
      name: expect.stringContaining('Layout shift'),
      span_id: expect.stringMatching(/[a-f\d]{16}/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f\d]{32}/),
      status: 'ok',
      is_segment: true,
    });
  },
);

sentryTest(
  'captures CLS increases after the pageload span ended, when page is hidden',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'pageload');
    const clsSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'ui.webvital.cls');

    await page.goto(url);

    const pageloadSpan = await pageloadSpanPromise;
    expect(pageloadSpan.attributes?.['sentry.op']?.value).toBe('pageload');

    const pageloadSpanId = pageloadSpan.span_id;
    const pageloadTraceId = pageloadSpan.trace_id;

    expect(pageloadSpanId).toMatch(/[a-f\d]{16}/);
    expect(pageloadTraceId).toMatch(/[a-f\d]{32}/);

    await triggerAndWaitForLayoutShift(page);

    await hidePage(page);

    const clsSpan = await clsSpanPromise;
    // Flakey value dependent on timings -> we check for a range
    expect(clsSpan.attributes?.['browser.web_vital.cls.value']?.value).toBeGreaterThan(0.05);
    expect(clsSpan.attributes?.['browser.web_vital.cls.value']?.value).toBeLessThan(0.15);

    // Ensure the CLS span is connected to the pageload span and trace
    expect(clsSpan.attributes?.['sentry.pageload.span_id']?.value).toBe(pageloadSpanId);
    expect(clsSpan.trace_id).toEqual(pageloadTraceId);

    expect(clsSpan.attributes?.['sentry.report_event']?.value).toBe('pagehide');
  },
);

sentryTest('sends CLS of the initial page when soft-navigating to a new page', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'pageload');

  await page.goto(url);

  const pageloadSpan = await pageloadSpanPromise;

  const clsSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'ui.webvital.cls');

  await triggerAndWaitForLayoutShift(page);

  await page.goto(`${url}#soft-navigation`);

  const pageloadTraceId = pageloadSpan.trace_id;
  expect(pageloadTraceId).toMatch(/[a-f\d]{32}/);

  const clsSpan = await clsSpanPromise;
  // Flakey value dependent on timings -> we check for a range
  expect(clsSpan.attributes?.['browser.web_vital.cls.value']?.value).toBeGreaterThan(0.05);
  expect(clsSpan.attributes?.['browser.web_vital.cls.value']?.value).toBeLessThan(0.15);
  expect(clsSpan.attributes?.['sentry.pageload.span_id']?.value).toBe(pageloadSpan.span_id);
  expect(clsSpan.trace_id).toEqual(pageloadTraceId);

  expect(clsSpan.attributes?.['sentry.report_event']?.value).toBe('navigation');
});

sentryTest("doesn't send further CLS after the first navigation", async ({ getLocalTestUrl, page }) => {
  const pageloadSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'pageload');
  const clsSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'ui.webvital.cls');

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  await pageloadSpanPromise;

  await triggerAndWaitForLayoutShift(page);

  await page.goto(`${url}#soft-navigation`);

  const clsSpan = await clsSpanPromise;
  expect(clsSpan.attributes?.['browser.web_vital.cls.value']?.value).toBeGreaterThan(0);
  expect(clsSpan.attributes?.['sentry.report_event']?.value).toBe('navigation');

  observeV2Span(page, span => {
    if (span.attributes?.['sentry.op']?.value === 'ui.webvital.cls') {
      throw new Error(
        `Unexpected CLS span (${span.name}, ${span.attributes?.['sentry.op']?.value}) - This should not happen!`,
      );
    }
    return false;
  });

  const navigationSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'navigation');

  // activate both CLS emission triggers:
  await page.goto(`${url}#soft-navigation-2`);
  await hidePage(page);

  // assumption: If we would send another CLS span on the 2nd navigation, it would be sent before the navigation
  // transaction ends. This isn't 100% safe to ensure we don't send something but otherwise we'd need to wait for
  // a timeout or something similar.
  await navigationSpanPromise;
});

sentryTest("doesn't send further CLS after the first page hide", async ({ getLocalTestUrl, page }) => {
  const pageloadSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'pageload');
  const clsSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'ui.webvital.cls');

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  await pageloadSpanPromise;

  await triggerAndWaitForLayoutShift(page);

  await hidePage(page);

  const clsSpan = await clsSpanPromise;
  expect(clsSpan.attributes?.['browser.web_vital.cls.value']?.value).toBeGreaterThan(0);
  expect(clsSpan.attributes?.['sentry.report_event']?.value).toBe('pagehide');

  observeV2Span(page, span => {
    if (span.attributes?.['sentry.op']?.value === 'ui.webvital.cls') {
      throw new Error(
        `Unexpected CLS span (${span.name}, ${span.attributes?.['sentry.op']?.value}) - This should not happen!`,
      );
    }
    return false;
  });

  const navigationSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'navigation');

  // activate both CLS emission triggers:
  await page.goto(`${url}#soft-navigation-2`);
  await hidePage(page);

  // assumption: If we would send another CLS span on the 2nd navigation, it would be sent before the navigation
  // transaction ends. This isn't 100% safe to ensure we don't send something but otherwise we'd need to wait for
  // a timeout or something similar.
  await navigationSpanPromise;
});

sentryTest('CLS span timestamps are set correctly', async ({ getLocalTestUrl, page }) => {
  const pageloadSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'pageload');
  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const pageloadSpan = await pageloadSpanPromise;
  const pageloadEndTimestamp = pageloadSpan.end_timestamp;

  const clsSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'ui.webvital.cls');

  await triggerAndWaitForLayoutShift(page);

  await hidePage(page);

  const clsSpan = await clsSpanPromise;

  expect(clsSpan.start_timestamp).toBeDefined();
  expect(clsSpan.end_timestamp).toBeDefined();

  const clsSpanStartTimestamp = clsSpan.start_timestamp;
  const clsSpanEndTimestamp = clsSpan.end_timestamp;

  // CLS performance entries have no duration ==> start and end timestamp should be the same
  expect(clsSpanStartTimestamp).toEqual(clsSpanEndTimestamp);

  // We don't really care that they are very close together but rather about the order of magnitude
  // Previously, we had a bug where the timestamps would be significantly off (by multiple hours)
  // so we only ensure that this bug is fixed. 60 seconds should be more than enough.
  expect(clsSpanStartTimestamp - pageloadEndTimestamp).toBeLessThan(60);
  expect(clsSpanStartTimestamp).toBeGreaterThan(pageloadEndTimestamp);
});
