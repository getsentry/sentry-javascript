import {
  assertSentryTransaction,
  getEnvelopeRequest,
  runServer,
  getMultipleEnvelopeRequest,
  assertSentryEvent,
} from './utils/helpers';

jest.spyOn(console, 'error').mockImplementation();

describe('Remix API Actions', () => {
  it('correctly instruments a parameterized Remix API action', async () => {
    const baseURL = await runServer();
    const url = `${baseURL}/action-json-response/123123`;
    const envelope = await getEnvelopeRequest(url, 'post');
    const transaction = envelope[2];

    assertSentryTransaction(transaction, {
      transaction: 'routes/action-json-response/$id',
      spans: [
        {
          description: 'routes/action-json-response/$id',
          op: 'remix.server.action',
        },
        {
          description: 'routes/action-json-response/$id',
          op: 'remix.server.documentRequest',
        },
      ],
    });
  });

  it('reports an error thrown from the action', async () => {
    const baseURL = await runServer();
    const url = `${baseURL}/action-json-response/-1`;

    const [transaction, event] = await getMultipleEnvelopeRequest(url, 2, 'post');

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
            value: 'Error',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: 'action',
              },
              handled: true,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });
});
