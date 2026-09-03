import { expect, it } from 'vitest';
import type { Envelope, Event } from '@sentry/core';
import { createRunner } from '../../../../runner';

it('propagates trace over RPC when the binding casing differs from rpcTracePropagationBindings', async ({ signal }) => {
  const transactionsByName = new Map<string, Event>();

  const collect = (envelope: Envelope): void => {
    const transactionEvent = envelope[1]?.[0]?.[1] as Event;
    transactionsByName.set(transactionEvent.transaction as string, transactionEvent);
  };

  const runner = createRunner(__dirname)
    .expect(collect)
    .expect(collect)
    .expect(collect)
    .expect(collect)
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/rpc/all');
  expect(response).toBe('Hello, World!,alpha,beta');

  await runner.completed();

  const worker = transactionsByName.get('GET /rpc/all');
  expect(worker?.contexts?.trace?.op).toBe('http.server');

  // `sayHello` comes from the string target, `alpha` and `beta` from the regex target. `beta` is the
  // one a stateful `g` regex would miss, because `alpha` already advanced its `lastIndex`.
  for (const methodName of ['sayHello', 'alpha', 'beta']) {
    const durableObject = transactionsByName.get(methodName);

    expect(durableObject?.contexts?.trace?.op).toBe('rpc');
    expect(durableObject?.contexts?.trace?.trace_id).toBe(worker?.contexts?.trace?.trace_id);
    expect(durableObject?.contexts?.trace?.parent_span_id).toBe(worker?.contexts?.trace?.span_id);
  }
});
