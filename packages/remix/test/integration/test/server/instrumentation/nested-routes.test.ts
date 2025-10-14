import type { Event, TransactionEvent } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { RemixTestEnv, assertSentryTransaction } from '../utils/helpers';

describe('Nested Route Parameterization', () => {
  it('correctly parameterizes a 2-level nested route (users/:userId/posts/:postId)', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/users/user123/posts/post456`;
    const envelope = await env.getEnvelopeRequest({ url, envelopeType: 'transaction' });
    const transaction = envelope[2] as unknown as TransactionEvent;

    assertSentryTransaction(transaction, {
      transaction: 'GET users/:userId/posts/:postId',
      transaction_info: {
        source: 'route',
      },
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
        },
      },
    });
  });

  it('correctly parameterizes a 3-level nested API route (api/v1/data/:id)', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/api/v1/data/abc123`;
    const envelope = await env.getEnvelopeRequest({ url, envelopeType: 'transaction' });
    const transaction = envelope[2] as unknown as TransactionEvent;

    assertSentryTransaction(transaction, {
      transaction: 'GET api/v1/data/:id',
      transaction_info: {
        source: 'route',
      },
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
        },
      },
    });
  });

  it('correctly parameterizes a deeply nested route (deeply/:nested/:structure/:id)', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/deeply/level1/level2/level3`;
    const envelope = await env.getEnvelopeRequest({ url, envelopeType: 'transaction' });
    const transaction = envelope[2] as unknown as TransactionEvent;

    assertSentryTransaction(transaction, {
      transaction: 'GET deeply/:nested/:structure/:id',
      transaction_info: {
        source: 'route',
      },
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
        },
      },
    });
  });

  it('correctly parameterizes flat routes with dot notation (products/:productId/reviews/:reviewId)', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/products/prod789/reviews/rev101`;
    const envelope = await env.getEnvelopeRequest({ url, envelopeType: 'transaction' });
    const transaction = envelope[2] as unknown as TransactionEvent;

    assertSentryTransaction(transaction, {
      transaction: 'GET products/:productId/reviews/:reviewId',
      transaction_info: {
        source: 'route',
      },
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
        },
      },
    });
  });

  it('sends loader span for nested route', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/users/user999/posts/post888`;
    const envelope = await env.getEnvelopeRequest({ url, envelopeType: 'transaction' });
    const transaction = envelope[2] as unknown as TransactionEvent;

    assertSentryTransaction(transaction, {
      transaction: 'GET users/:userId/posts/:postId',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            'code.function': 'loader',
            'sentry.op': 'loader.remix',
          }),
        }),
      ]),
    });
  });

  it('differentiates between nested and flat routes with same parameter names', async () => {
    const env = await RemixTestEnv.init();

    // Request flat route
    const flatEnvelope = await env.getEnvelopeRequest({
      url: `${env.url}/loader-json-response/flat123`,
      envelopeType: 'transaction',
      endServer: false,
    });

    // Request nested route
    const nestedEnvelope = await env.getEnvelopeRequest({
      url: `${env.url}/users/nested123/posts/post123`,
      envelopeType: 'transaction',
    });

    const flatTransaction = flatEnvelope[2];
    const nestedTransaction = nestedEnvelope[2];

    // Verify they have different transaction names
    expect((flatTransaction as Event).transaction).toBe('GET loader-json-response/:id');
    expect((nestedTransaction as Event).transaction).toBe('GET users/:userId/posts/:postId');
  });
});
