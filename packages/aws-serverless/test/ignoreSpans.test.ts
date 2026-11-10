import { URL_PATH } from '@sentry/conventions/attributes';
import { FUNCTION_AWS } from '@sentry/conventions/op';
import type { Envelope } from '@sentry/core';
import { createTransport, parseEnvelope, resolvedSyncPromise } from '@sentry/core';
import type { Context, Handler } from 'aws-lambda';
import { beforeEach, describe, expect, test } from 'vitest';
import { init } from '../src/init';
import { instrumentHandler } from '../src/instrumentHandler';

const envelopes: Envelope[] = [];

init({
  dsn: 'https://public@example.com/1',
  tracesSampleRate: 1,
  ignoreSpans: [{ op: FUNCTION_AWS, attributes: { [URL_PATH]: '/health' } }],
  transport: () =>
    createTransport({ recordDroppedEvent: () => undefined }, request => {
      envelopes.push(parseEnvelope(request.body));
      return resolvedSyncPromise({});
    }),
});

const context = {
  awsRequestId: 'awsRequestId',
  functionName: 'functionName',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:functionName',
  logGroupName: 'logGroupName',
  logStreamName: 'logStreamName',
  getRemainingTimeInMillis: () => 3000,
} as Context;

const handler = instrumentHandler((async () => ({ statusCode: 200 })) as Handler);

async function invokeAndGetSentPaths(method: string, path: string): Promise<unknown[]> {
  envelopes.length = 0;
  await (handler as any)(
    { version: '2.0', routeKey: '$default', rawPath: path, requestContext: { http: { method, path } } },
    context,
    () => {},
  );

  return envelopes.flatMap(([, items]) =>
    items.flatMap(([header, payload]) =>
      header.type === 'span'
        ? (payload as { items: { attributes?: Record<string, { value: unknown }> }[] }).items.map(
            span => span.attributes?.[URL_PATH]?.value,
          )
        : [],
    ),
  );
}

describe('default ignoreSpans', () => {
  beforeEach(() => {
    envelopes.length = 0;
  });

  test.each(['/favicon.ico', '/robots.txt', '/assets/app.js'])('drops GET %s invocations', async path => {
    expect(await invokeAndGetSentPaths('GET', path)).toEqual([]);
  });

  test.each(['OPTIONS', 'HEAD'])('drops %s invocations', async method => {
    expect(await invokeAndGetSentPaths(method, '/users')).toEqual([]);
  });

  test('keeps other invocations', async () => {
    expect(await invokeAndGetSentPaths('GET', '/')).toEqual(['/']);
    expect(await invokeAndGetSentPaths('POST', '/favicon.ico')).toEqual(['/favicon.ico']);
  });

  test('keeps the ignoreSpans the user passed', async () => {
    expect(await invokeAndGetSentPaths('GET', '/health')).toEqual([]);
  });
});
