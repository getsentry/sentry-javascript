import { URL_FULL } from '@sentry/conventions/attributes';
import type { Context } from 'aws-lambda';
import { describe, expect, test } from 'vitest';
import { getRequestSpanOptions } from '../src/requestSpanOptions';

const context = {
  functionName: 'functionName',
  awsRequestId: 'awsRequestId',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:functionName',
} as Context;

function getUrlFull(headers: Record<string, string>): unknown {
  const event = { version: '2.0', rawPath: '/users', headers, requestContext: { http: { method: 'GET' } } };
  return getRequestSpanOptions(event, context, false).attributes?.[URL_FULL];
}

describe('getRequestSpanOptions', () => {
  test.each([
    ['https', '443'],
    ['http', '80'],
  ])('omits the default port for %s', (proto, port) => {
    expect(getUrlFull({ host: 'example.com', 'x-forwarded-proto': proto, 'x-forwarded-port': port })).toBe(
      `${proto}://example.com/users`,
    );
  });

  test('keeps a non-default port', () => {
    expect(getUrlFull({ host: 'example.com', 'x-forwarded-proto': 'https', 'x-forwarded-port': '8443' })).toBe(
      'https://example.com:8443/users',
    );
  });

  test('does not add the port again when the host header has it', () => {
    expect(getUrlFull({ host: 'example.com:8080', 'x-forwarded-proto': 'http', 'x-forwarded-port': '8080' })).toBe(
      'http://example.com:8080/users',
    );
  });
});
