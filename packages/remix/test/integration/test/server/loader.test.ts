import {
  assertSentryTransaction,
  getEnvelopeRequest,
  runServer,
  getMultipleEnvelopeRequest,
  assertSentryEvent,
} from './utils/helpers';

jest.spyOn(console, 'error').mockImplementation();

// Repeat tests for each adapter
describe.each(['builtin', 'express'])('Remix API Loaders with adapter = %s', adapter => {
  it('reports an error thrown from the loader', async () => {
    const baseURL = await runServer(adapter);
    const url = `${baseURL}/loader-json-response/-2`;

    let [transaction, event] = await getMultipleEnvelopeRequest(url, 2);

    // The event envelope is returned before the transaction envelope when using express adapter.
    // We can update this when we merge the envelope filtering utility.
    adapter === 'express' && ([event, transaction] = [transaction, event]);

    assertSentryTransaction(transaction[2], {
      contexts: {
        trace: {
          status: 'internal_error',
          tags: {
            'http.status_code': '500',
          },
        },
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

  it('correctly instruments a parameterized Remix API loader', async () => {
    const baseURL = await runServer(adapter);
    const url = `${baseURL}/loader-json-response/123123`;
    const envelope = await getEnvelopeRequest(url);
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
    const baseURL = await runServer(adapter);
    const url = `${baseURL}/loader-json-response/-1`;

    const [transaction_1, event, transaction_2] = await getMultipleEnvelopeRequest(url, 3);

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
    const baseURL = await runServer();

    await Promise.all(
      Array.from(Array(5).keys()).map(async (id: number) => {
        const url = `${baseURL}/scope-bleed/${id}`;
        await new Promise(resolve => setTimeout(resolve, 5000 - id * 1000 - 1000));
        const envelope = await getEnvelopeRequest(url);
        const transaction = envelope[2];

        assertSentryTransaction(transaction, {
          tags: {
            [`tag${id}`]: String(id),
          },
        });
      }),
    );
  });
});
