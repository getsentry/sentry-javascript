import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../utils/helpers';

sentryTest(
  'enhanceFetchErrorMessages: report-only: enhances error for Sentry while preserving original',
  async ({ getLocalTestUrl, page, browserName }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });
    const reqPromise = waitForErrorRequest(page);
    const pageErrorPromise = new Promise<string>(resolve => page.on('pageerror', error => resolve(error.message)));

    await page.goto(url);
    await page.evaluate('networkError()');

    const [req, pageErrorMessage] = await Promise.all([reqPromise, pageErrorPromise]);
    const eventData = envelopeRequestParser(req);
    const originalErrorMap: Record<string, string> = {
      chromium: 'Failed to fetch',
      webkit: 'Load failed',
      firefox: 'NetworkError when attempting to fetch resource.',
    };

    const enhancedErrorMap: Record<string, string> = {
      chromium: 'Failed to fetch (sentry-test-external.io)',
      webkit: 'Load failed (sentry-test-external.io)',
      firefox: 'NetworkError when attempting to fetch resource. (sentry-test-external.io)',
    };

    const originalError = originalErrorMap[browserName];
    const enhancedError = enhancedErrorMap[browserName];

    expect(pageErrorMessage).toContain(originalError);
    expect(pageErrorMessage).not.toContain('sentry-test-external.io');

    // Verify Sentry received the enhanced message
    // Note: In report-only mode, the original error message remains unchanged
    // at the JavaScript level (for third-party package compatibility),
    // but Sentry gets the enhanced version via __sentry_fetch_url_host__
    expect(eventData.exception?.values).toHaveLength(1);
    expect(eventData.exception?.values?.[0]).toMatchObject({
      type: 'TypeError',
      value: enhancedError,
      mechanism: {
        handled: false,
        type: 'auto.browser.global_handlers.onunhandledrejection',
      },
    });
  },
);

sentryTest(
  'enhanceFetchErrorMessages: report-only: enhances subdomain errors',
  async ({ getLocalTestUrl, page, browserName }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });
    const reqPromise = waitForErrorRequest(page);
    const pageErrorPromise = new Promise<string>(resolve => page.on('pageerror', error => resolve(error.message)));

    await page.goto(url);
    await page.evaluate('networkErrorSubdomain()');

    const [req, pageErrorMessage] = await Promise.all([reqPromise, pageErrorPromise]);
    const eventData = envelopeRequestParser(req);

    const originalErrorMap: Record<string, string> = {
      chromium: 'Failed to fetch',
      webkit: 'Load failed',
      firefox: 'NetworkError when attempting to fetch resource.',
    };

    const enhancedErrorMap: Record<string, string> = {
      chromium: 'Failed to fetch (subdomain.sentry-test-external.io)',
      webkit: 'Load failed (subdomain.sentry-test-external.io)',
      firefox: 'NetworkError when attempting to fetch resource. (subdomain.sentry-test-external.io)',
    };

    const originalError = originalErrorMap[browserName];
    const enhancedError = enhancedErrorMap[browserName];

    expect(pageErrorMessage).toContain(originalError);
    expect(pageErrorMessage).not.toContain('subdomain.sentry-test-external.io');
    expect(eventData.exception?.values).toHaveLength(1);
    expect(eventData.exception?.values?.[0]).toMatchObject({
      type: 'TypeError',
      value: enhancedError,
      mechanism: {
        handled: false,
        type: 'auto.browser.global_handlers.onunhandledrejection',
      },
    });
  },
);

sentryTest(
  'enhanceFetchErrorMessages: report-only: includes port in hostname',
  async ({ getLocalTestUrl, page, browserName }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });
    const reqPromise = waitForErrorRequest(page);

    const pageErrorPromise = new Promise<string>(resolve => page.on('pageerror', error => resolve(error.message)));

    await page.goto(url);
    await page.evaluate('networkErrorWithPort()');

    const [req, pageErrorMessage] = await Promise.all([reqPromise, pageErrorPromise]);
    const eventData = envelopeRequestParser(req);

    const originalErrorMap: Record<string, string> = {
      chromium: 'Failed to fetch',
      webkit: 'Load failed',
      firefox: 'NetworkError when attempting to fetch resource.',
    };

    const enhancedErrorMap: Record<string, string> = {
      chromium: 'Failed to fetch (sentry-test-external.io:3000)',
      webkit: 'Load failed (sentry-test-external.io:3000)',
      firefox: 'NetworkError when attempting to fetch resource. (sentry-test-external.io:3000)',
    };

    const originalError = originalErrorMap[browserName];
    const enhancedError = enhancedErrorMap[browserName];

    expect(pageErrorMessage).toContain(originalError);
    expect(pageErrorMessage).not.toContain('sentry-test-external.io:3000');
    expect(eventData.exception?.values).toHaveLength(1);
    expect(eventData.exception?.values?.[0]).toMatchObject({
      type: 'TypeError',
      value: enhancedError,
      mechanism: {
        handled: false,
        type: 'auto.browser.global_handlers.onunhandledrejection',
      },
    });
  },
);
