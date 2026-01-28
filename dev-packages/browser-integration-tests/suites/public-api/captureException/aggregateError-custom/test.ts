import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';

sentryTest('captures custom AggregateErrors', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForErrorRequestOnUrl(page, url);
  const eventData = envelopeRequestParser(req);

  expect(eventData.exception?.values).toHaveLength(5); // CustomAggregateError + 3 embedded errors + 1 aggregate cause

  // Verify the embedded errors come first
  expect(eventData.exception?.values).toEqual([
    {
      mechanism: { exception_id: 4, handled: true, parent_id: 0, source: 'errors[1]', type: 'chained' },
      stacktrace: {
        frames: [
          { colno: 12, filename: 'http://sentry-test.io/subject.bundle.js', function: '?', in_app: true, lineno: 14 },
          { colno: 5, filename: 'http://sentry-test.io/subject.bundle.js', function: '?', in_app: true, lineno: 10 },
        ],
      },
      type: 'Error',
      value: 'error 2',
    },
    {
      mechanism: { exception_id: 3, handled: true, parent_id: 2, source: 'cause', type: 'chained' },
      stacktrace: {
        frames: [
          { colno: 12, filename: 'http://sentry-test.io/subject.bundle.js', function: '?', in_app: true, lineno: 14 },
          { colno: 10, filename: 'http://sentry-test.io/subject.bundle.js', function: '?', in_app: true, lineno: 9 },
        ],
      },
      type: 'Error',
      value: 'error 1 cause',
    },
    {
      mechanism: { exception_id: 2, handled: true, parent_id: 0, source: 'errors[0]', type: 'chained' },
      stacktrace: {
        frames: [
          { colno: 12, filename: 'http://sentry-test.io/subject.bundle.js', function: '?', in_app: true, lineno: 14 },
          { colno: 50, filename: 'http://sentry-test.io/subject.bundle.js', function: '?', in_app: true, lineno: 8 },
        ],
      },
      type: 'Error',
      value: 'error 1',
    },
    {
      mechanism: { exception_id: 1, handled: true, parent_id: 0, source: 'cause', type: 'chained' },
      stacktrace: {
        frames: [
          { colno: 12, filename: 'http://sentry-test.io/subject.bundle.js', function: '?', in_app: true, lineno: 14 },
          { colno: 10, filename: 'http://sentry-test.io/subject.bundle.js', function: '?', in_app: true, lineno: 11 },
        ],
      },
      type: 'Error',
      value: 'aggregate cause',
    },
    {
      mechanism: { exception_id: 0, handled: true, type: 'generic', is_exception_group: true },
      stacktrace: {
        frames: [
          { colno: 12, filename: 'http://sentry-test.io/subject.bundle.js', function: '?', in_app: true, lineno: 14 },
          { colno: 24, filename: 'http://sentry-test.io/subject.bundle.js', function: '?', in_app: true, lineno: 8 },
        ],
      },
      type: 'CustomAggregateError',
      value: 'custom aggregate error',
    },
  ]);
});
