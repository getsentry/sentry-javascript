import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem } from '@sentry-internal/test-utils';
import type { SerializedLogContainer } from '@sentry/core';

test('should send Effect debug logs', async ({ page }) => {
  const logEnvelopePromise = waitForEnvelopeItem('effect-browser', envelope => {
    return (
      envelope[0].type === 'log' &&
      (envelope[1] as SerializedLogContainer).items.some(
        item => item.level === 'debug' && item.body === 'Debug log from Effect',
      )
    );
  });

  await page.goto('/');
  const logButton = page.locator('id=log-button');
  await logButton.click();

  await expect(page.locator('id=log-result')).toHaveText('Logs sent!');

  const logEnvelope = await logEnvelopePromise;
  const logs = (logEnvelope[1] as SerializedLogContainer).items;
  const debugLog = logs.find(log => log.level === 'debug' && log.body === 'Debug log from Effect');
  expect(debugLog).toBeDefined();
  expect(debugLog?.level).toBe('debug');
});

test('should send Effect info logs', async ({ page }) => {
  const logEnvelopePromise = waitForEnvelopeItem('effect-browser', envelope => {
    return (
      envelope[0].type === 'log' &&
      (envelope[1] as SerializedLogContainer).items.some(
        item => item.level === 'info' && item.body === 'Info log from Effect',
      )
    );
  });

  await page.goto('/');
  const logButton = page.locator('id=log-button');
  await logButton.click();

  await expect(page.locator('id=log-result')).toHaveText('Logs sent!');

  const logEnvelope = await logEnvelopePromise;
  const logs = (logEnvelope[1] as SerializedLogContainer).items;
  const infoLog = logs.find(log => log.level === 'info' && log.body === 'Info log from Effect');
  expect(infoLog).toBeDefined();
  expect(infoLog?.level).toBe('info');
});

test('should send Effect warning logs', async ({ page }) => {
  const logEnvelopePromise = waitForEnvelopeItem('effect-browser', envelope => {
    return (
      envelope[0].type === 'log' &&
      (envelope[1] as SerializedLogContainer).items.some(
        item => item.level === 'warn' && item.body === 'Warning log from Effect',
      )
    );
  });

  await page.goto('/');
  const logButton = page.locator('id=log-button');
  await logButton.click();

  await expect(page.locator('id=log-result')).toHaveText('Logs sent!');

  const logEnvelope = await logEnvelopePromise;
  const logs = (logEnvelope[1] as SerializedLogContainer).items;
  const warnLog = logs.find(log => log.level === 'warn' && log.body === 'Warning log from Effect');
  expect(warnLog).toBeDefined();
  expect(warnLog?.level).toBe('warn');
});

test('should send Effect error logs', async ({ page }) => {
  const logEnvelopePromise = waitForEnvelopeItem('effect-browser', envelope => {
    return (
      envelope[0].type === 'log' &&
      (envelope[1] as SerializedLogContainer).items.some(
        item => item.level === 'error' && item.body === 'Error log from Effect',
      )
    );
  });

  await page.goto('/');
  const logButton = page.locator('id=log-button');
  await logButton.click();

  await expect(page.locator('id=log-result')).toHaveText('Logs sent!');

  const logEnvelope = await logEnvelopePromise;
  const logs = (logEnvelope[1] as SerializedLogContainer).items;
  const errorLog = logs.find(log => log.level === 'error' && log.body === 'Error log from Effect');
  expect(errorLog).toBeDefined();
  expect(errorLog?.level).toBe('error');
});

test('should send Effect logs with context attributes', async ({ page }) => {
  const logEnvelopePromise = waitForEnvelopeItem('effect-browser', envelope => {
    return (
      envelope[0].type === 'log' &&
      (envelope[1] as SerializedLogContainer).items.some(item => item.body === 'Log with context')
    );
  });

  await page.goto('/');
  const logContextButton = page.locator('id=log-context-button');
  await logContextButton.click();

  await expect(page.locator('id=log-context-result')).toHaveText('Log with context sent!');

  const logEnvelope = await logEnvelopePromise;
  const logs = (logEnvelope[1] as SerializedLogContainer).items;
  const contextLog = logs.find(log => log.body === 'Log with context');
  expect(contextLog).toBeDefined();
  expect(contextLog?.level).toBe('info');
});
