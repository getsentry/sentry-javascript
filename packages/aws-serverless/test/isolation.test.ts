import type { Event } from '@sentry/core';
import { addBreadcrumb, captureException, setUser } from '@sentry/node';
import type { Context, Handler, StreamifyHandler } from 'aws-lambda';
import { PassThrough } from 'stream';
import { beforeEach, describe, expect, test } from 'vitest';
import { init } from '../src/init';
import { AWS_HANDLER_STREAMING_RESPONSE, AWS_HANDLER_STREAMING_SYMBOL, wrapHandler } from '../src/sdk';

const events: Event[] = [];

init({
  dsn: 'https://public@example.com/1',
  beforeSend(event) {
    events.push(event);
    return null;
  },
});

function createContext(awsRequestId: string, remainingTimeInMillis = 3000): Context {
  return {
    awsRequestId,
    functionName: 'functionName',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:functionName',
    logGroupName: 'logGroupName',
    logStreamName: 'logStreamName',
    getRemainingTimeInMillis: () => remainingTimeInMillis,
  } as Context;
}

function handleRequest(event: { user?: string }): void {
  if (event.user) {
    setUser({ id: event.user });
    addBreadcrumb({ message: `handled request for ${event.user}` });
  } else {
    captureException(new Error('anonymous request failed'));
  }
}

function expectNoLeakedData(event: Event | undefined, awsRequestId: string): void {
  expect(event?.user).toBeUndefined();
  expect(event?.breadcrumbs).toBeUndefined();
  expect(event?.contexts?.['aws.lambda']?.aws_request_id).toBe(awsRequestId);
}

describe('wrapHandler isolation', () => {
  beforeEach(() => {
    events.length = 0;
  });

  test('does not leak isolation scope data between invocations', async () => {
    const handler = wrapHandler((async (event: { user?: string }) => handleRequest(event)) as Handler);

    await (handler as any)({ user: 'alice' }, createContext('1'));
    await (handler as any)({}, createContext('2'));

    expect(events).toHaveLength(1);
    expectNoLeakedData(events[0], '2');
  });

  test('does not leak isolation scope data between streaming invocations', async () => {
    const streamingHandler = (async (event: { user?: string }) => handleRequest(event)) as unknown as StreamifyHandler;
    (streamingHandler as any)[AWS_HANDLER_STREAMING_SYMBOL] = AWS_HANDLER_STREAMING_RESPONSE;
    const handler = wrapHandler(streamingHandler);

    await (handler as any)({ user: 'alice' }, new PassThrough(), createContext('1'));
    await (handler as any)({}, new PassThrough(), createContext('2'));

    expect(events).toHaveLength(1);
    expectNoLeakedData(events[0], '2');
  });

  test('captures the timeout warning with the data of its own invocation', async () => {
    const handler = wrapHandler((async (event: { user?: string; wait?: number }) => {
      setUser({ id: event.user });
      await new Promise(resolve => setTimeout(resolve, event.wait));
    }) as Handler);

    await (handler as any)({ user: 'alice', wait: 0 }, createContext('1'));
    await (handler as any)({ user: 'bob', wait: 50 }, createContext('2', 510));

    expect(events).toHaveLength(1);
    expect(events[0]?.message).toBe('Possible function timeout: functionName');
    expect(events[0]?.user).toEqual({ id: 'bob' });
    expect(events[0]?.contexts?.['aws.lambda']?.aws_request_id).toBe('2');
  });
});
