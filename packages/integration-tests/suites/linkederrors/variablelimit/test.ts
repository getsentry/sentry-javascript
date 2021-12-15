import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getSentryRequest } from '../../../utils/helpers';

sentryTest('should allow to change stack size limit', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryRequest(page, url);

  const exception = eventData.exception;
  expect(eventData.exception).toBeDefined();

  const exceptionValues = exception!.values!;
  expect(exceptionValues).toBeDefined();

  // It shouldn't include root exception, as it's already processed in the event by the main error handler
  expect(exceptionValues.length).toBe(2);
  expect(exceptionValues[0].type).toBe('TypeError');
  expect(exceptionValues[0].value).toBe('two');
  expect(exceptionValues[0].stacktrace).toHaveProperty('frames');
  expect(exceptionValues[1].type).toBe('Error');
  expect(exceptionValues[1].value).toBe('one');
  expect(exceptionValues[1].stacktrace).toHaveProperty('frames');
});
