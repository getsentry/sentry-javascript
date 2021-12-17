import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getSentryEvents } from '../../../../utils/helpers';

sentryTest('should capture with different severity levels', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const events = await getSentryEvents(page, url);

  expect(events[0].message).toBe('debug_message');
  expect(events[0].level).toBe('debug');

  expect(events[1].message).toBe('info_message');
  expect(events[1].level).toBe('info');

  expect(events[2].message).toBe('warning_message');
  expect(events[2].level).toBe('warning');

  expect(events[3].message).toBe('error_message');
  expect(events[3].level).toBe('error');

  expect(events[4].message).toBe('fatal_message');
  expect(events[4].level).toBe('fatal');

  expect(events[5].message).toBe('critical_message');
  expect(events[5].level).toBe('critical');

  expect(events[6].message).toBe('log_message');
  expect(events[6].level).toBe('log');
});
