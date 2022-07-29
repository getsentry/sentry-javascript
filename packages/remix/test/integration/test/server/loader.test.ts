import { assertSentryTransaction, getEnvelopeRequest, runServer } from './utils/helpers';

describe('Remix API Loaders', () => {
  it('correctly instruments a Remix API loader', async () => {
    const baseURL = await runServer();
    const url = `${baseURL}/loader-json-response/123123`;
    const envelope = await getEnvelopeRequest(url);
    const transaction = envelope[2];

    assertSentryTransaction(transaction, {
      name: 'routes/loader-json-response/$id',
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
