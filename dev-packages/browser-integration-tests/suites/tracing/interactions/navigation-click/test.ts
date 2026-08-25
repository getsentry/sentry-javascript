import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest(
  'click-triggered navigation should produce a root navigation transaction',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);
    await waitForTransactionRequest(page); // "pageload" root span

    const interactionRequestPromise = waitForTransactionRequest(
      page,
      evt => evt.contexts?.trace?.op === 'ui.action.click',
    );
    const navigationRequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'navigation');

    await page.locator('[data-test-id=navigate-button]').click();

    const interactionEvent = envelopeRequestParser(await interactionRequestPromise);
    const navigationEvent = envelopeRequestParser(await navigationRequestPromise);

    // Navigation is root span, not a child span on the interaction
    expect(interactionEvent.contexts?.trace?.op).toBe('ui.action.click');
    expect(navigationEvent.contexts?.trace?.op).toBe('navigation');

    expect(interactionEvent.contexts?.trace?.trace_id).not.toEqual(navigationEvent.contexts?.trace?.trace_id);

    // does not contain a child navigation span
    const interactionSpans = interactionEvent.spans || [];
    const hasNavigationChild = interactionSpans.some(span => span.op === 'navigation' || span.op === 'http.server');
    expect(hasNavigationChild).toBeFalsy();
  },
);
