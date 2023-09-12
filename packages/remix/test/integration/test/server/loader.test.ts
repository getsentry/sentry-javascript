import { assertSentryTransaction, RemixTestEnv, assertSentryEvent } from './utils/helpers';
import { Event } from '@sentry/types';

const useV2 = process.env.REMIX_VERSION === '2';

jest.spyOn(console, 'error').mockImplementation();

// Repeat tests for each adapter
describe.each(['builtin', 'express'])('Remix API Loaders with adapter = %s', adapter => {
  it('reports an error thrown from the loader', async () => {
    const env = await RemixTestEnv.init(adapter);
    const url = `${env.url}/loader-json-response/-2`;

    const envelopes = await env.getMultipleEnvelopeRequest({ url, count: 2, envelopeType: ['transaction', 'event'] });

    const event = envelopes[0][2].type === 'transaction' ? envelopes[1][2] : envelopes[0][2];
    const transaction = envelopes[0][2].type === 'transaction' ? envelopes[0][2] : envelopes[1][2];

    assertSentryTransaction(transaction, {
      contexts: {
        trace: {
          status: 'internal_error',
          tags: {
            'http.status_code': '500',
          },
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
                function: useV2 ? 'remix.server' : 'loader',
              },
              handled: false,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });

  it('correctly instruments a parameterized Remix API loader', async () => {
    const env = await RemixTestEnv.init(adapter);
    const url = `${env.url}/loader-json-response/123123`;
    const envelope = await env.getEnvelopeRequest({ url, envelopeType: 'transaction' });
    const transaction = envelope[2];

    assertSentryTransaction(transaction, {
      transaction: `routes/loader-json-response${useV2 ? '.' : '/'}$id`,
      transaction_info: {
        source: 'route',
      },
      spans: [
        {
          description: 'root',
          op: 'function.remix.loader',
        },
        {
          description: `routes/loader-json-response${useV2 ? '.' : '/'}$id`,
          op: 'function.remix.loader',
        },
        {
          description: `routes/loader-json-response${useV2 ? '.' : '/'}$id`,
          op: 'function.remix.document_request',
        },
      ],
    });
  });

  it('handles a thrown 500 response', async () => {
    const env = await RemixTestEnv.init(adapter);
    const url = `${env.url}/loader-json-response/-1`;

    const envelopes = await env.getMultipleEnvelopeRequest({
      url,
      count: 3,
      envelopeType: ['transaction', 'event'],
    });

    const [transaction_1, transaction_2] = envelopes.filter(envelope => envelope[1].type === 'transaction');
    const [event] = envelopes.filter(envelope => envelope[1].type === 'event');

    assertSentryTransaction(transaction_1[2], {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
          tags: {
            method: 'GET',
            'http.status_code': '302',
          },
          data: {
            'http.response.status_code': 302,
          },
        },
      },
      tags: {
        transaction: `routes/loader-json-response${useV2 ? '.' : '/'}$id`,
      },
    });

    assertSentryTransaction(transaction_2[2], {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
          tags: {
            method: 'GET',
            'http.status_code': '500',
          },
          data: {
            'http.response.status_code': 500,
          },
        },
      },
      tags: {
        transaction: `routes/loader-json-response${useV2 ? '.' : '/'}$id`,
      },
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
                function: useV2 ? 'remix.server' : 'loader',
              },
              handled: false,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });

  it('makes sure scope does not bleed between requests', async () => {
    const env = await RemixTestEnv.init(adapter);

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
    const env = await RemixTestEnv.init(adapter);
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
    const env = await RemixTestEnv.init(adapter);
    const url = `${env.url}/loader-defer-response`;
    const envelope = await env.getEnvelopeRequest({ url, envelopeType: 'transaction' });
    const transaction = envelope[2];

    assertSentryTransaction(transaction, {
      transaction: useV2 ? 'routes/loader-defer-response' : 'root',
      transaction_info: {
        source: 'route',
      },
      spans: useV2
        ? [
            {
              description: 'root',
              op: 'function.remix.loader',
            },
            {
              description: 'routes/loader-defer-response',
              op: 'function.remix.loader',
            },
            {
              description: 'routes/loader-defer-response',
              op: 'function.remix.document_request',
            },
          ]
        : [
            {
              description: 'root',
              op: 'function.remix.loader',
            },
            {
              description: 'routes/loader-defer-response/index',
              op: 'function.remix.loader',
            },
            {
              description: 'root',
              op: 'function.remix.document_request',
            },
          ],
    });
  });
});
