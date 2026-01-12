import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../utils/helpers';

sentryTest('handles fetch network errors @firefox', async ({ getLocalTestUrl, page, browserName }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const reqPromise = waitForErrorRequest(page);
  const pageErrorPromise = new Promise<string>(resolve => page.on('pageerror', error => resolve(error.message)));

  await page.goto(url);
  await page.evaluate('networkError()');

  const [req, pageErrorMessage] = await Promise.all([reqPromise, pageErrorPromise]);
  const eventData = envelopeRequestParser(req);

  const errorMap: Record<string, string> = {
    chromium: 'Failed to fetch (sentry-test-external.io)',
    webkit: 'Load failed (sentry-test-external.io)',
    firefox: 'NetworkError when attempting to fetch resource. (sentry-test-external.io)',
  };

  const error = errorMap[browserName];

  expect(pageErrorMessage).toContain(error);
  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'TypeError',
    value: error,
    mechanism: {
      handled: false,
      type: 'auto.browser.global_handlers.onunhandledrejection',
    },
  });
});

sentryTest('handles fetch network errors on subdomains @firefox', async ({ getLocalTestUrl, page, browserName }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const reqPromise = waitForErrorRequest(page);
  const pageErrorPromise = new Promise<string>(resolve => page.on('pageerror', error => resolve(error.message)));

  await page.goto(url);
  await page.evaluate('networkErrorSubdomain()');

  const [req, pageErrorMessage] = await Promise.all([reqPromise, pageErrorPromise]);
  const eventData = envelopeRequestParser(req);

  const errorMap: Record<string, string> = {
    chromium: 'Failed to fetch (subdomain.sentry-test-external.io)',
    webkit: 'Load failed (subdomain.sentry-test-external.io)',
    firefox: 'NetworkError when attempting to fetch resource. (subdomain.sentry-test-external.io)',
  };

  const error = errorMap[browserName];

  // Verify the error message at JavaScript level includes the hostname
  expect(pageErrorMessage).toContain(error);

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'TypeError',
    value: error,
    mechanism: {
      handled: false,
      type: 'auto.browser.global_handlers.onunhandledrejection',
    },
  });
});

sentryTest('handles fetch invalid header name errors @firefox', async ({ getLocalTestUrl, page, browserName }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const reqPromise = waitForErrorRequest(page);
  await page.goto(url);
  await page.evaluate('invalidHeaderName()');

  const eventData = envelopeRequestParser(await reqPromise);

  const errorMap: Record<string, string> = {
    chromium: "Failed to execute 'fetch' on 'Window': Invalid name",
    webkit: "Invalid header name: 'C ontent-Type'",
    firefox: 'Window.fetch: c ontent-type is an invalid header name.',
  };

  const error = errorMap[browserName];

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'TypeError',
    value: error,
    mechanism: {
      handled: false,
      type: 'auto.browser.global_handlers.onunhandledrejection',
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});

sentryTest('handles fetch invalid header value errors @firefox', async ({ getLocalTestUrl, page, browserName }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const reqPromise = waitForErrorRequest(page);
  await page.goto(url);
  await page.evaluate('invalidHeaderValue()');

  const eventData = envelopeRequestParser(await reqPromise);

  const errorMap: Record<string, string> = {
    chromium:
      "Failed to execute 'fetch' on 'Window': Failed to read the 'headers' property from 'RequestInit': The provided value cannot be converted to a sequence.",
    webkit: 'Value is not a sequence',
    firefox:
      "Window.fetch: Element of sequence<sequence<ByteString>> branch of (sequence<sequence<ByteString>> or record<ByteString, ByteString>) can't be converted to a sequence.",
  };

  const error = errorMap[browserName];

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'TypeError',
    value: error,
    mechanism: {
      handled: false,
      type: 'auto.browser.global_handlers.onunhandledrejection',
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});

sentryTest('handles fetch invalid URL scheme errors @firefox', async ({ getLocalTestUrl, page, browserName }) => {
  await page.route('http://sentry-test-external.io/**', route => {
    return route.fulfill({
      status: 200,
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  const reqPromise = waitForErrorRequest(page);
  const pageErrorPromise = new Promise<string>(resolve => page.on('pageerror', error => resolve(error.message)));

  await page.goto(url);
  await page.evaluate('invalidUrlScheme()');

  const [req, pageErrorMessage] = await Promise.all([reqPromise, pageErrorPromise]);
  const eventData = envelopeRequestParser(req);

  /**
   * This kind of error does show a helpful warning in the console, e.g.:
   * Fetch API cannot load blub://sentry-test-external.io/invalid-scheme. URL scheme "blub" is not supported.
   * But it seems we cannot really access this in the SDK :(
   *
   * Note: On WebKit, invalid URL schemes trigger TWO different errors:
   * 1. A synchronous "access control checks" error (captured by pageerror)
   * 2. A "Load failed" error from the fetch rejection (which we enhance)
   * So we use separate error maps for pageError and sentryError on this test.
   */
  const pageErrorMap: Record<string, string> = {
    chromium: 'Failed to fetch (sentry-test-external.io)',
    webkit: '/sentry-test-external.io/invalid-scheme due to access control checks.',
    firefox: 'NetworkError when attempting to fetch resource. (sentry-test-external.io)',
  };

  const sentryErrorMap: Record<string, string> = {
    chromium: 'Failed to fetch (sentry-test-external.io)',
    webkit: 'Load failed (sentry-test-external.io)',
    firefox: 'NetworkError when attempting to fetch resource. (sentry-test-external.io)',
  };

  const pageError = pageErrorMap[browserName];
  const sentryError = sentryErrorMap[browserName];

  expect(pageErrorMessage).toContain(pageError);
  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'TypeError',
    value: sentryError,
    mechanism: {
      handled: false,
      type: 'auto.browser.global_handlers.onunhandledrejection',
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});

sentryTest('handles fetch credentials in url errors @firefox', async ({ getLocalTestUrl, page, browserName }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const reqPromise = waitForErrorRequest(page);
  await page.goto(url);
  await page.evaluate('credentialsInUrl()');

  const eventData = envelopeRequestParser(await reqPromise);

  const errorMap: Record<string, string> = {
    chromium:
      "Failed to execute 'fetch' on 'Window': Request cannot be constructed from a URL that includes credentials: https://user:password@sentry-test-external.io/credentials-in-url",
    webkit: 'URL is not valid or contains user credentials.',
    firefox:
      'Window.fetch: https://user:password@sentry-test-external.io/credentials-in-url is an url with embedded credentials.',
  };

  const error = errorMap[browserName];

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'TypeError',
    value: error,
    mechanism: {
      handled: false,
      type: 'auto.browser.global_handlers.onunhandledrejection',
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});

sentryTest('handles fetch invalid mode errors @firefox', async ({ getLocalTestUrl, page, browserName }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const reqPromise = waitForErrorRequest(page);
  await page.goto(url);
  await page.evaluate('invalidMode()');

  const eventData = envelopeRequestParser(await reqPromise);

  const errorMap: Record<string, string> = {
    chromium:
      "Failed to execute 'fetch' on 'Window': Cannot construct a Request with a RequestInit whose mode member is set as 'navigate'.",
    webkit: 'Request constructor does not accept navigate fetch mode.',
    firefox: 'Window.fetch: Invalid request mode navigate.',
  };

  const error = errorMap[browserName];

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'TypeError',
    value: error,
    mechanism: {
      handled: false,
      type: 'auto.browser.global_handlers.onunhandledrejection',
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});

sentryTest('handles fetch invalid request method errors @firefox', async ({ getLocalTestUrl, page, browserName }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const reqPromise = waitForErrorRequest(page);
  await page.goto(url);
  await page.evaluate('invalidMethod()');

  const eventData = envelopeRequestParser(await reqPromise);

  const errorMap: Record<string, string> = {
    chromium: "Failed to execute 'fetch' on 'Window': 'CONNECT' HTTP method is unsupported.",
    webkit: 'Method is forbidden.',
    firefox: 'Window.fetch: Invalid request method CONNECT.',
  };

  const error = errorMap[browserName];

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'TypeError',
    value: error,
    mechanism: {
      handled: false,
      type: 'auto.browser.global_handlers.onunhandledrejection',
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});

sentryTest(
  'handles fetch no-cors mode with cors-required method errors @firefox',
  async ({ getLocalTestUrl, page, browserName }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });
    const reqPromise = waitForErrorRequest(page);
    await page.goto(url);
    await page.evaluate('noCorsMethod()');

    const eventData = envelopeRequestParser(await reqPromise);

    const errorMap: Record<string, string> = {
      chromium: "Failed to execute 'fetch' on 'Window': 'PUT' is unsupported in no-cors mode.",
      webkit: 'Method must be GET, POST or HEAD in no-cors mode.',
      firefox: 'Window.fetch: Invalid request method PUT.',
    };

    const error = errorMap[browserName];

    expect(eventData.exception?.values).toHaveLength(1);
    expect(eventData.exception?.values?.[0]).toMatchObject({
      type: 'TypeError',
      value: error,
      mechanism: {
        handled: false,
        type: 'auto.browser.global_handlers.onunhandledrejection',
      },
      stacktrace: {
        frames: expect.any(Array),
      },
    });
  },
);
