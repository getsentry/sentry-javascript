import { assertSentryTransaction, getEnvelopeRequest, runServer } from './utils/helpers';

describe('Remix API Loaders', () => {
  it('correctly instruments a Remix API loader', async () => {
    const baseURL = await runServer();
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
});
