import { assertSentryTransaction, getEnvelopeRequest } from './utils/helpers';

describe('Remix API Loaders', () => {
  it('correctly instruments a Remix API loader', async () => {
    const url = 'http://localhost:3000/loader-json-response/123123';
    const envelope = await getEnvelopeRequest(url);
    const transaction = envelope[2];

    assertSentryTransaction(transaction, {
      spans: [
        {
          description: url,
          op: 'remix.server.loader',
        },
        {
          description: url,
          op: 'remix.server.documentRequest',
        },
      ],
    });
  });
});
