import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

const APP_NAME = 'nestjs-11';

test('Trace includes span and correct value for decorated async function', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-span-decorator-async');

  const response = await fetch(`${baseURL}/test-span-decorator-async`);
  const body = await response.json();

  expect(body.result).toEqual('test');

  const spans = await spansPromise;

  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'wait',
      is_segment: false,
      status: 'ok',
      attributes: expect.objectContaining({
        'sentry.origin': { type: 'string', value: 'auto.function.nestjs.sentry_traced' },
        'sentry.op': { type: 'string', value: 'wait and return a string' },
      }),
    }),
  );
});

test('Trace includes span and correct value for decorated sync function', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-span-decorator-sync');

  const response = await fetch(`${baseURL}/test-span-decorator-sync`);
  const body = await response.json();

  expect(body.result).toEqual('test');

  const spans = await spansPromise;

  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'getString',
      is_segment: false,
      status: 'ok',
      attributes: expect.objectContaining({
        'sentry.origin': { type: 'string', value: 'auto.function.nestjs.sentry_traced' },
        'sentry.op': { type: 'string', value: 'return a string' },
      }),
    }),
  );
});

test('preserves original function name on decorated functions', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-function-name`);
  const body = await response.json();

  expect(body.result).toEqual('getFunctionName');
});
