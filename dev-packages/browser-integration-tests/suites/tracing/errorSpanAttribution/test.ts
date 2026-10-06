import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import {
  envelopeRequestParser,
  runScriptInSandbox,
  shouldSkipTracingTest,
  waitForErrorRequest,
  waitForTransactionRequest,
} from '../../../utils/helpers';

// The browser SDK parents every span to the root span, so `outer` and `inner` are siblings under the
// pageload span rather than a chain. Attribution still has to pick the span the error escaped.
const waitForPageloadWithSpans = (page: Page) =>
  waitForTransactionRequest(
    page,
    event => event.contexts?.trace?.op === 'pageload' && !!event.spans?.some(span => span.description === 'inner'),
  );

sentryTest(
  'attributes an uncaught error to the span it escaped, not the pageload span active when it surfaces',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (browserName === 'webkit') {
      // Errors thrown from `runScriptInSandbox` are Script Errors on Webkit and skipped by Sentry
      sentryTest.skip();
    }

    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const errorRequestPromise = waitForErrorRequest(page);
    const transactionRequestPromise = waitForPageloadWithSpans(page);

    await page.goto(url);

    await runScriptInSandbox(page, {
      content: `
      setTimeout(() => {
        Sentry.startSpan({ name: 'outer' }, () => {
          Sentry.startSpan({ name: 'inner' }, () => {
            throw new Error('Escaped Error');
          });
        });
      });
      `,
    });

    const errorEvent = envelopeRequestParser<Event>(await errorRequestPromise);
    const transactionEvent = envelopeRequestParser<Event>(await transactionRequestPromise);

    const innerSpan = transactionEvent.spans?.find(span => span.description === 'inner');

    expect(errorEvent.exception?.values?.[0]?.value).toBe('Escaped Error');
    expect(errorEvent.contexts?.trace?.trace_id).toBe(transactionEvent.contexts?.trace?.trace_id);
    expect(errorEvent.contexts?.trace?.span_id).toBe(innerSpan?.span_id);
    expect(errorEvent.contexts?.trace?.span_id).not.toBe(transactionEvent.contexts?.trace?.span_id);
  },
);

sentryTest(
  'attributes a caught error to the span it escaped, not the span it was caught in',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const errorRequestPromise = waitForErrorRequest(page);
    const transactionRequestPromise = waitForPageloadWithSpans(page);

    await page.goto(url);

    await runScriptInSandbox(page, {
      content: `
      Sentry.startSpan({ name: 'outer' }, () => {
        try {
          Sentry.startSpan({ name: 'inner' }, () => {
            throw new Error('Caught Error');
          });
        } catch (error) {
          Sentry.captureException(error);
        }
      });
      `,
    });

    const errorEvent = envelopeRequestParser<Event>(await errorRequestPromise);
    const transactionEvent = envelopeRequestParser<Event>(await transactionRequestPromise);

    const innerSpan = transactionEvent.spans?.find(span => span.description === 'inner');
    const outerSpan = transactionEvent.spans?.find(span => span.description === 'outer');

    expect(errorEvent.exception?.values?.[0]?.value).toBe('Caught Error');
    expect(errorEvent.contexts?.trace?.trace_id).toBe(transactionEvent.contexts?.trace?.trace_id);
    expect(errorEvent.contexts?.trace?.span_id).toBe(innerSpan?.span_id);
    expect(errorEvent.contexts?.trace?.span_id).not.toBe(outerSpan?.span_id);
  },
);
