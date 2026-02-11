import type { Event } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { RemixTestEnv, assertSentryEvent, assertSentryTransaction } from '../utils/helpers';

describe('Remix API Loaders', () => {
  it('reports an error thrown from the loader', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/loader-json-response/-2`;

    const envelopes = await env.getMultipleEnvelopeRequest({ url, count: 2, envelopeType: ['transaction', 'event'] });

    const event = envelopes[0][2].type === 'transaction' ? envelopes[1][2] : envelopes[0][2];
    const transaction = envelopes[0][2].type === 'transaction' ? envelopes[0][2] : envelopes[1][2];

    assertSentryTransaction(transaction, {
      contexts: {
        trace: {
          status: 'internal_error',
          data: {
            'http.response.status_code': 500,
          },
        },
      },
    });

    assertSentryEvent(event, {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Unexpected Server Error',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: 'remix.server.handleError',
              },
              handled: false,
              type: 'auto.function.remix.server',
            },
          },
        ],
      },
    });
  });

  it('reports a thrown error response the loader', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/loader-throw-response/-1`;

    // We also wait for the transaction, even though we don't care about it for this test
    // but otherwise this may leak into another test
    const envelopes = await env.getMultipleEnvelopeRequest({ url, count: 2, envelopeType: ['event', 'transaction'] });

    const event = envelopes[0][2].type === 'transaction' ? envelopes[1][2] : envelopes[0][2];
    const transaction = envelopes[0][2].type === 'transaction' ? envelopes[0][2] : envelopes[1][2];

    assertSentryTransaction(transaction, {
      contexts: {
        trace: {
          status: 'internal_error',
          data: {
            'http.response.status_code': 500,
          },
        },
      },
    });

    assertSentryEvent(event, {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Not found',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: 'loader',
              },
              handled: false,
              type: 'auto.function.remix.server',
            },
          },
        ],
      },
    });
  });

  it('correctly instruments a parameterized Remix API loader', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/loader-json-response/123123`;
    const envelope = await env.getEnvelopeRequest({ url, envelopeType: 'transaction' });
    const transaction = envelope[2];

    assertSentryTransaction(transaction, {
      transaction: `GET loader-json-response/:id`,
      transaction_info: {
        source: 'route',
      },
      spans: [
        {
          data: {
            'code.function': 'loader',
            'sentry.op': 'loader.remix',
            'sentry.origin': 'auto.http.otel.remix',
          },
          origin: 'auto.http.otel.remix',
        },
        {
          data: {
            'code.function': 'loader',
            'sentry.op': 'loader.remix',
            'sentry.origin': 'auto.http.otel.remix',
          },
          origin: 'auto.http.otel.remix',
        },
      ],
    });
  });

  it('handles an error-throwing redirection target', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/loader-json-response/-1`;

    const envelopes = await env.getMultipleEnvelopeRequest({
      url,
      count: 2,
      envelopeType: ['transaction', 'event'],
    });

    const [transaction] = envelopes.filter(envelope => envelope[1].type === 'transaction');
    const [event] = envelopes.filter(envelope => envelope[1].type === 'event');

    assertSentryTransaction(transaction[2], {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
          data: {
            'http.response.status_code': 500,
          },
        },
      },
      transaction: `GET loader-json-response/:id`,
    });

    assertSentryEvent(event[2], {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Unexpected Server Error',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: 'remix.server.handleError',
              },
              handled: false,
              type: 'auto.function.remix.server',
            },
          },
        ],
      },
    });
  });

  it('makes sure scope does not bleed between requests', async () => {
    const env = await RemixTestEnv.init();

    const envelopes = await Promise.all([
      env.getEnvelopeRequest({ url: `${env.url}/scope-bleed/1`, endServer: false, envelopeType: 'transaction' }),
      env.getEnvelopeRequest({ url: `${env.url}/scope-bleed/2`, endServer: false, envelopeType: 'transaction' }),
      env.getEnvelopeRequest({ url: `${env.url}/scope-bleed/3`, endServer: false, envelopeType: 'transaction' }),
      env.getEnvelopeRequest({ url: `${env.url}/scope-bleed/4`, endServer: false, envelopeType: 'transaction' }),
    ]);

    await new Promise(resolve => env.server.close(resolve));

    envelopes.forEach(envelope => {
      const tags = envelope[2].tags as NonNullable<Event['tags']>;
      const customTagArr = Object.keys(tags).filter(t => t.startsWith('tag'));
      expect(customTagArr).toHaveLength(1);

      const key = customTagArr[0];
      const val = key[key.length - 1];
      expect(tags[key]).toEqual(val);
    });
  });

  it('continues transaction from sentry-trace header and baggage', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/loader-json-response/3`;

    // send sentry-trace and baggage headers to loader
    env.setAxiosConfig({
      headers: {
        'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
        baggage: 'sentry-version=1.0,sentry-environment=production,sentry-trace_id=12312012123120121231201212312012',
      },
    });
    const envelope = await env.getEnvelopeRequest({ url, envelopeType: 'transaction' });

    expect(envelope[0].trace).toMatchObject({
      trace_id: '12312012123120121231201212312012',
    });

    assertSentryTransaction(envelope[2], {
      contexts: {
        trace: {
          trace_id: '12312012123120121231201212312012',
          parent_span_id: '1121201211212012',
        },
      },
    });
  });

  it('correctly instruments a deferred loader', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/loader-defer-response/123123`;
    const envelope = await env.getEnvelopeRequest({ url, envelopeType: 'transaction' });
    const transaction = envelope[2];

    assertSentryTransaction(transaction, {
      transaction: 'GET loader-defer-response/:id',
      transaction_info: {
        source: 'route',
      },
      spans: [
        {
          data: {
            'code.function': 'loader',
            'sentry.op': 'loader.remix',
            'match.route.id': 'root',
          },
        },
        {
          data: {
            'code.function': 'loader',
            'sentry.op': 'loader.remix',
            'match.route.id': 'routes/loader-defer-response.$id',
          },
        },
      ],
    });
  });

  it('does not capture thrown redirect responses', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/throw-redirect`;

    const envelopesCount = await env.countEnvelopes({
      url,
      envelopeType: 'event',
      timeout: 3000,
    });

    expect(envelopesCount).toBe(0);
  });
});
