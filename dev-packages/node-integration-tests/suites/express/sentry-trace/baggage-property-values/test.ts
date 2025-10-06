import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';
import type { TestAPIResponse } from './server';

afterAll(() => {
  cleanupChildProcesses();
});

test('should preserve baggage property values with equal signs (W3C spec compliance)', async () => {
  const runner = createRunner(__dirname, 'server.ts').start();

  // W3C spec example: https://www.w3.org/TR/baggage/#example
  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express-property-values', {
    headers: {
      'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
      baggage: 'key1=value1;property1;property2,key2=value2,key3=value3; propertyKey=propertyValue',
    },
  });

  expect(response).toBeDefined();

  // The baggage should be parsed and re-serialized, preserving property values with = signs
  const baggageItems = response?.test_data.baggage?.split(',').map(item => decodeURIComponent(item.trim()));

  expect(baggageItems).toContain('key1=value1;property1;property2');
  expect(baggageItems).toContain('key2=value2');
  expect(baggageItems).toContain('key3=value3; propertyKey=propertyValue');
});
