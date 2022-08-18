import {
  assertSentryTransaction,
  getEnvelopeRequest,
  runServer,
  getMultipleEnvelopeRequest,
  assertSentryEvent,
} from './utils/helpers';
import { Event } from '@sentry/types';

jest.spyOn(console, 'error').mockImplementation();

// Repeat tests for each adapter
describe.each(['builtin', 'express'])('Remix API Loaders with adapter = %s', adapter => {
  it('reports an error thrown from the loader', async () => {
    const config = await runServer(adapter);
    const url = `${config.url}/loader-json-response/-2`;

    const envelopes = await getMultipleEnvelopeRequest(
      { ...config, url },
      { count: 2, envelopeType: ['transaction', 'event'] },
    );

    const event = envelopes[0][2].type === 'transaction' ? envelopes[1][2] : envelopes[0][2];
    const transaction = envelopes[0][2].type === 'transaction' ? envelopes[0][2] : envelopes[1][2];

    assertSentryTransaction(transaction, {
      contexts: {
        trace: {
          status: 'internal_error',
          tags: {
            'http.status_code': '500',
          },
        },
      },
    });

    assertSentryEvent(event, {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Unexpected Server Error from Loader',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: 'loader',
              },
              handled: true,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });

  it('correctly instruments a parameterized Remix API loader', async () => {
    const config = await runServer(adapter);
    const url = `${config.url}/loader-json-response/123123`;
    const envelope = await getEnvelopeRequest({ ...config, url }, { envelopeType: 'transaction' });
    const transaction = envelope[2];

    assertSentryTransaction(transaction, {
      transaction: 'routes/loader-json-response/$id',
      transaction_info: {
        source: 'route',
      },
      spans: [
        {
          description: 'root',
          op: 'remix.server.loader',
        },
        {
          description: 'routes/loader-json-response/$id',
          op: 'remix.server.loader',
        },
        {
          description: 'routes/loader-json-response/$id',
          op: 'remix.server.documentRequest',
        },
      ],
    });
  });

  it('handles a thrown 500 response', async () => {
    const config = await runServer(adapter);
    const url = `${config.url}/loader-json-response/-1`;

    const [transaction_1, event, transaction_2] = await getMultipleEnvelopeRequest(
      { ...config, url },
      { count: 3, envelopeType: ['transaction', 'event'] },
    );

    assertSentryTransaction(transaction_1[2], {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
          tags: {
            method: 'GET',
            'http.status_code': '302',
          },
        },
      },
      tags: {
        transaction: 'routes/loader-json-response/$id',
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
        },
      },
      tags: {
        transaction: 'routes/loader-json-response/$id',
      },
    });

    assertSentryEvent(event[2], {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Unexpected Server Error from Loader',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: 'loader',
              },
              handled: true,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });

  it('makes sure scope does not bleed between requests', async () => {
    const { url, server } = await runServer(adapter);

    const envelopes = await Promise.all([
      getEnvelopeRequest({ url: `${url}/scope-bleed/1`, server }, { endServer: false, envelopeType: 'transaction' }),
      getEnvelopeRequest({ url: `${url}/scope-bleed/2`, server }, { endServer: false, envelopeType: 'transaction' }),
      getEnvelopeRequest({ url: `${url}/scope-bleed/3`, server }, { endServer: false, envelopeType: 'transaction' }),
      getEnvelopeRequest({ url: `${url}/scope-bleed/4`, server }, { endServer: false, envelopeType: 'transaction' }),
    ]);

    await new Promise(resolve => server.close(resolve));

    envelopes.forEach(envelope => {
      const tags = envelope[2].tags as NonNullable<Event['tags']>;
      const customTagArr = Object.keys(tags).filter(t => t.startsWith('tag'));
      expect(customTagArr).toHaveLength(1);

      const key = customTagArr[0];
      const val = key[key.length - 1];
      expect(tags[key]).toEqual(val);
    });
  });
});
