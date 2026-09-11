import type { Envelope, TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';

function getTransaction(envelope: Envelope): TransactionEvent {
  const [itemHeader, itemPayload] = envelope[1][0];
  expect(itemHeader.type).toBe('transaction');
  return itemPayload as TransactionEvent;
}

it('captures incoming request bodies by default', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transaction = getTransaction(envelope);
      expect(transaction.request).toMatchObject({
        method: 'POST',
        url: expect.stringContaining('/default'),
        query_string: 'source=test',
        headers: expect.objectContaining({ 'content-type': 'text/plain' }),
        data: 'captured-by-default',
      });
    })
    .start(signal);

  const response = await runner.makeRequest<string>('post', '/default?source=test', {
    headers: { 'content-type': 'text/plain' },
    data: 'captured-by-default',
  });
  expect(response).toBe('captured-by-default');
  await runner.completed();
});

it('an explicit small size overrides disabled body collection', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .withEnv({ BODY_MODE: 'explicit-small' })
    .expect(envelope => {
      const transaction = getTransaction(envelope);
      expect(transaction.request?.data).toBe(`${'a'.repeat(997)}...`);
    })
    .start(signal);

  const body = 'a'.repeat(1_001);
  const response = await runner.makeRequest<string>('post', '/explicit-small', {
    headers: { 'content-type': 'text/plain' },
    data: body,
  });
  expect(response).toBe(body);
  await runner.completed();
});

it('an explicit none overrides enabled body collection', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .withEnv({ BODY_MODE: 'explicit-none' })
    .expect(envelope => {
      const transaction = getTransaction(envelope);
      expect(transaction.request?.method).toBe('POST');
      expect(transaction.request?.data).toBeUndefined();
    })
    .start(signal);

  const response = await runner.makeRequest<string>('post', '/explicit-none', {
    headers: { 'content-type': 'text/plain' },
    data: 'do-not-capture',
  });
  expect(response).toBe('do-not-capture');
  await runner.completed();
});
