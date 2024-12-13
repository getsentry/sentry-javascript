import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem, waitForTransaction } from '@sentry-internal/test-utils';

test('sends an INP span during pageload', async ({ page }) => {
  const inpSpanPromise = waitForEnvelopeItem('create-remix-app', item => {
    return item[0].type === 'span';
  });

  await page.goto(`/`);

  await page.click('#exception-button');

  await page.waitForTimeout(500);

  // Page hide to trigger INP
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });

  const inpSpan = await inpSpanPromise;

  expect(inpSpan[1]).toEqual({
    data: {
      'sentry.origin': 'auto.http.browser.inp',
      'sentry.op': 'ui.interaction.click',
      release: 'e2e-test',
      environment: 'qa',
      transaction: 'routes/_index',
      'sentry.exclusive_time': expect.any(Number),
      'sentry.sample_rate': 1,
      'sentry.source': 'custom',
      replay_id: expect.any(String),
      'user_agent.original': expect.stringContaining('Chrome'),
    },
    description: 'body > div > input#exception-button[type="button"]',
    op: 'ui.interaction.click',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    is_segment: true,
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.http.browser.inp',
    exclusive_time: expect.any(Number),
    measurements: { inp: { unit: 'millisecond', value: expect.any(Number) } },
    segment_id: expect.any(String),
  });
});

test('sends an INP span after pageload', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === 'routes/_index';
  });

  await page.goto(`/`);

  await transactionPromise;

  const inpSpanPromise1 = waitForEnvelopeItem('create-remix-app', item => {
    return item[0].type === 'span';
  });

  await page.click('#exception-button');

  await page.waitForTimeout(500);

  // Page hide to trigger INP
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });

  const inpSpan1 = await inpSpanPromise1;

  expect(inpSpan1[1]).toEqual({
    data: {
      'sentry.origin': 'auto.http.browser.inp',
      'sentry.op': 'ui.interaction.click',
      release: 'e2e-test',
      environment: 'qa',
      transaction: 'routes/_index',
      'sentry.exclusive_time': expect.any(Number),
      'sentry.sample_rate': 1,
      'sentry.source': 'custom',
      replay_id: expect.any(String),
      'user_agent.original': expect.stringContaining('Chrome'),
    },
    description: 'body > div > input#exception-button[type="button"]',
    op: 'ui.interaction.click',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    is_segment: true,
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.http.browser.inp',
    exclusive_time: expect.any(Number),
    measurements: { inp: { unit: 'millisecond', value: expect.any(Number) } },
    segment_id: expect.any(String),
  });
});

test('sends an INP span during navigation', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  const inpSpanPromise = waitForEnvelopeItem('create-remix-app', item => {
    return item[0].type === 'span';
  });

  await page.goto(`/`);

  await page.click('#navigation');

  await page.waitForTimeout(500);

  // Page hide to trigger INP
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });

  const inpSpan = await inpSpanPromise;

  expect(inpSpan[1]).toEqual({
    data: {
      'sentry.origin': 'auto.http.browser.inp',
      'sentry.op': 'ui.interaction.click',
      release: 'e2e-test',
      environment: 'qa',
      transaction: 'routes/user.$id',
      'sentry.exclusive_time': expect.any(Number),
      replay_id: expect.any(String),
      'user_agent.original': expect.stringContaining('Chrome'),
    },
    description: '<unknown>',
    op: 'ui.interaction.click',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.http.browser.inp',
    exclusive_time: expect.any(Number),
    measurements: { inp: { unit: 'millisecond', value: expect.any(Number) } },
    segment_id: expect.any(String),
  });
});

test('sends an INP span after navigation', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  const transactionPromise = waitForTransaction('create-remix-app', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'navigation' && transactionEvent.transaction === 'routes/user.$id';
  });

  await page.goto(`/`);

  await page.click('#navigation');

  await transactionPromise;

  const inpSpanPromise = waitForEnvelopeItem('create-remix-app', item => {
    return item[0].type === 'span';
  });

  await page.click('#button');

  await page.waitForTimeout(500);

  // Page hide to trigger INP
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });

  const inpSpan = await inpSpanPromise;

  expect(inpSpan[1]).toEqual({
    data: {
      'sentry.origin': 'auto.http.browser.inp',
      'sentry.op': 'ui.interaction.click',
      release: 'e2e-test',
      environment: 'qa',
      transaction: 'routes/user.$id',
      'sentry.exclusive_time': expect.any(Number),
      replay_id: expect.any(String),
      'sentry.sample_rate': 1,
      'sentry.source': 'custom',
      'user_agent.original': expect.stringContaining('Chrome'),
    },
    description: '<unknown>',
    op: 'ui.interaction.click',
    is_segment: true,
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.http.browser.inp',
    exclusive_time: expect.any(Number),
    measurements: { inp: { unit: 'millisecond', value: expect.any(Number) } },
    segment_id: expect.any(String),
  });
});
