import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import {
  envelopeRequestParser,
  properEnvelopeRequestParser,
  shouldSkipTracingTest,
  waitForTransactionRequest,
} from '../../../utils/helpers';

sentryTest('allows to wrap sync methods with a timing metric', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const beforeTime = Math.floor(Date.now() / 1000);

  const metricsPromiseReq = page.waitForRequest(req => {
    const postData = req.postData();
    if (!postData) {
      return false;
    }

    try {
      // this implies this is a metrics envelope
      return typeof envelopeRequestParser(req) === 'string';
    } catch {
      return false;
    }
  });

  const transactionPromise = waitForTransactionRequest(page);

  await page.goto(url);
  await page.waitForFunction('typeof window.timingSync === "function"');
  const response = await page.evaluate('window.timingSync()');

  expect(response).toBe('sync done');

  const statsdString = envelopeRequestParser<string>(await metricsPromiseReq);
  const transactionEvent = properEnvelopeRequestParser(await transactionPromise);

  expect(typeof statsdString).toEqual('string');

  const parsedStatsd = /timingSync@second:(0\.\d+)\|d\|#(.+)\|T(\d+)/.exec(statsdString);

  expect(parsedStatsd).toBeTruthy();

  const duration = parseFloat(parsedStatsd![1]);
  const tags = parsedStatsd![2];
  const timestamp = parseInt(parsedStatsd![3], 10);

  expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
  expect(tags).toEqual('release:1.0.0,transaction:manual span');
  expect(duration).toBeGreaterThan(0.2);
  expect(duration).toBeLessThan(1);

  expect(transactionEvent).toBeDefined();
  expect(transactionEvent.transaction).toEqual('manual span');

  const spans = transactionEvent.spans || [];

  expect(spans.length).toBe(1);
  const span = spans[0];
  expect(span.op).toEqual('metrics.timing');
  expect(span.description).toEqual('timingSync');
  expect(span.timestamp! - span.start_timestamp).toEqual(duration);
  expect(span._metrics_summary).toEqual({
    'd:timingSync@second': [
      {
        count: 1,
        max: duration,
        min: duration,
        sum: duration,
        tags: {
          release: '1.0.0',
          transaction: 'manual span',
        },
      },
    ],
  });
});

sentryTest('allows to wrap async methods with a timing metric', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const beforeTime = Math.floor(Date.now() / 1000);

  const metricsPromiseReq = page.waitForRequest(req => {
    const postData = req.postData();
    if (!postData) {
      return false;
    }

    try {
      // this implies this is a metrics envelope
      return typeof envelopeRequestParser(req) === 'string';
    } catch {
      return false;
    }
  });

  const transactionPromise = waitForTransactionRequest(page);

  await page.goto(url);
  await page.waitForFunction('typeof window.timingAsync === "function"');
  const response = await page.evaluate('window.timingAsync()');

  expect(response).toBe('async done');

  const statsdString = envelopeRequestParser<string>(await metricsPromiseReq);
  const transactionEvent = properEnvelopeRequestParser(await transactionPromise);

  expect(typeof statsdString).toEqual('string');

  const parsedStatsd = /timingAsync@second:(0\.\d+)\|d\|#(.+)\|T(\d+)/.exec(statsdString);

  expect(parsedStatsd).toBeTruthy();

  const duration = parseFloat(parsedStatsd![1]);
  const tags = parsedStatsd![2];
  const timestamp = parseInt(parsedStatsd![3], 10);

  expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
  expect(tags).toEqual('release:1.0.0,transaction:manual span');
  expect(duration).toBeGreaterThan(0.2);
  expect(duration).toBeLessThan(1);

  expect(transactionEvent).toBeDefined();
  expect(transactionEvent.transaction).toEqual('manual span');

  const spans = transactionEvent.spans || [];

  expect(spans.length).toBe(1);
  const span = spans[0];
  expect(span.op).toEqual('metrics.timing');
  expect(span.description).toEqual('timingAsync');
  expect(span.timestamp! - span.start_timestamp).toEqual(duration);
  expect(span._metrics_summary).toEqual({
    'd:timingAsync@second': [
      {
        count: 1,
        max: duration,
        min: duration,
        sum: duration,
        tags: {
          release: '1.0.0',
          transaction: 'manual span',
        },
      },
    ],
  });
});
