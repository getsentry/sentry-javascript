import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getSentryRequest } from '../../../utils/helpers';

sentryTest('should allow to change walk key', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryRequest(page, url);

  const exception = eventData.exception;
  expect(eventData.exception).toBeDefined();

  const exceptionValues = exception!.values!;
  expect(exceptionValues).toBeDefined();

  // It shouldn't include root exception, as it's already processed in the event by the main error handler
  expect(exceptionValues.length).toBe(3);
  expect(exceptionValues[0].type).toBe('SyntaxError');
  expect(exceptionValues[0].value).toBe('three');
  expect(exceptionValues[0].stacktrace).toHaveProperty('frames');
  expect(exceptionValues[1].type).toBe('TypeError');
  expect(exceptionValues[1].value).toBe('two');
  expect(exceptionValues[1].stacktrace).toHaveProperty('frames');
  expect(exceptionValues[2].type).toBe('Error');
  expect(exceptionValues[2].value).toBe('one');
  expect(exceptionValues[2].stacktrace).toHaveProperty('frames');
});
