import {
  CLOUD_ACCOUNT_ID,
  CLOUD_PLATFORM,
  CLOUD_PROVIDER,
  FAAS_COLDSTART,
  FAAS_NAME,
  SENTRY_KIND,
  SENTRY_OP,
  URL_FULL,
} from '@sentry/conventions/attributes';
import { FUNCTION_AWS } from '@sentry/conventions/op';
import type { Client } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SERVERLESS_FUNCTION_SPAN_NAME_FALLBACK } from '@sentry/core';
import type { Context } from 'aws-lambda';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { getRequestSpanOptions } from '../src/requestSpanOptions';

function createContext(overrides: Partial<Context> = {}): Context {
  return {
    functionName: 'my-function',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:012345678912:function:my-function',
    awsRequestId: '1e1cd0dc-6bd0-4e0e-9a5d-63e8c7bd4b3b',
    ...overrides,
  } as Context;
}

function mockSpanStreaming(enabled: boolean): void {
  vi.spyOn(SentryCore, 'getClient').mockReturnValue({
    getOptions: () => ({ traceLifecycle: enabled ? 'stream' : 'static' }),
  } as unknown as Client);
}

describe('getRequestSpanOptions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  test('names the span after the function and sets the invocation attributes', () => {
    mockSpanStreaming(false);

    expect(getRequestSpanOptions({}, createContext(), true)).toEqual({
      name: 'my-function',
      attributes: {
        [SENTRY_OP]: FUNCTION_AWS,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.aws_lambda',
        [SENTRY_KIND]: 'server',
        'faas.execution': '1e1cd0dc-6bd0-4e0e-9a5d-63e8c7bd4b3b',
        'faas.id': 'arn:aws:lambda:us-east-1:012345678912:function:my-function',
        [CLOUD_ACCOUNT_ID]: '012345678912',
        [CLOUD_PROVIDER]: 'aws',
        [CLOUD_PLATFORM]: 'aws_lambda',
        [FAAS_NAME]: 'my-function',
        [FAAS_COLDSTART]: true,
      },
    });
  });

  test.each([true, false])('names the span after the function with span streaming %s', spanStreamingEnabled => {
    mockSpanStreaming(spanStreamingEnabled);

    const spanOptions = getRequestSpanOptions({}, createContext(), false);

    expect(spanOptions.name).toBe('my-function');
    expect(spanOptions.attributes?.[FAAS_NAME]).toBe('my-function');
  });

  test('keeps the API gateway URL on an attribute rather than in the name', () => {
    mockSpanStreaming(true);

    const event = {
      headers: { host: 'api.example.com', 'x-forwarded-proto': 'https' },
      path: '/users/123',
      queryStringParameters: { expand: 'profile' },
    };

    const spanOptions = getRequestSpanOptions(event, createContext(), false);

    expect(spanOptions.name).toBe('my-function');
    expect(spanOptions.attributes?.[URL_FULL]).toBe('https://api.example.com/users/123?expand=profile');
  });

  test('falls back to AWS_LAMBDA_FUNCTION_NAME when the context has no function name', () => {
    mockSpanStreaming(true);
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', 'my-env-function');

    const spanOptions = getRequestSpanOptions({}, createContext({ functionName: '' }), false);

    expect(spanOptions.name).toBe('my-env-function');
    expect(spanOptions.attributes?.[FAAS_NAME]).toBe('my-env-function');
  });

  test('falls back to the static span name when no function name is resolvable', () => {
    mockSpanStreaming(true);
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '');

    const spanOptions = getRequestSpanOptions({}, createContext({ functionName: '' }), false);

    expect(spanOptions.name).toBe(SERVERLESS_FUNCTION_SPAN_NAME_FALLBACK);
    expect(spanOptions.attributes?.[FAAS_NAME]).toBeUndefined();
  });

  test('keeps the unresolved function name without span streaming', () => {
    mockSpanStreaming(false);
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '');

    const spanOptions = getRequestSpanOptions({}, createContext({ functionName: '' }), false);

    expect(spanOptions.name).toBe('');
  });
});
