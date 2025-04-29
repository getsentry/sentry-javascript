import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';

sentryTest('should inject dialog script into <head> with correct attributes', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const dialogScriptSelector = 'head > script[src^="https://dsn.ingest.sentry.io/api/embed/error-page"]';

  await page.goto(url);
  const dialogScript = await page.waitForSelector(dialogScriptSelector, { state: 'attached' });
  const dialogScriptSrc = await dialogScript.getAttribute('src');

  expect(dialogScriptSrc?.startsWith('https://dsn.ingest.sentry.io/api/embed/error-page/?')).toBe(true);
  // After `?` is searchParams.

  const searchParams = new URLSearchParams(new URL(dialogScriptSrc || '').searchParams);

  expect(searchParams.get('dsn')).toBe('https://public@dsn.ingest.sentry.io/1337');
  expect(searchParams.get('eventId')).toBe('test_id');
  expect(searchParams.get('name')).toBe('test');
  expect(searchParams.get('email')).toBe('foo@bar.sentry.io');
  expect(searchParams.get('lang')).toBe('en-nz');
  expect(searchParams.get('title')).toBe('test_title');
  expect(searchParams.get('subtitle')).toBe('test_subtitle');
  expect(searchParams.get('subtitle2')).toBe('test_subtitle2');
  expect(searchParams.get('labelName')).toBe('test_label_name');
  expect(searchParams.get('labelEmail')).toBe('test_label_email');
  expect(searchParams.get('labelComments')).toBe('test_label_comments');
  expect(searchParams.get('labelClose')).toBe('test_label_close');
  expect(searchParams.get('labelSubmit')).toBe('test_label_submit');
  expect(searchParams.get('errorGeneric')).toBe('test_error_generic');
  expect(searchParams.get('errorFormEntry')).toBe('test_error_form_entry');
  expect(searchParams.get('successMessage')).toBe('test_success_message');
});
