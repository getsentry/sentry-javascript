import { NextTestEnv } from './utils/helpers';

describe('getServerSideProps', () => {
  it('should capture a transaction', async () => {
    const env = await NextTestEnv.init();
    const url = `${env.url}/193/withServerSideProps`;

    const envelopes = await env.getMultipleEnvelopeRequest({
      url,
      envelopeType: 'transaction',
      count: 2, // We will receive 2 transactions - one from Next.js instrumentation and one from our SDK
    });

    const sentryTransactionEnvelope = envelopes.find(envelope => {
      const envelopeItem = envelope[2];
      return envelopeItem.transaction === '/[id]/withServerSideProps';
    });

    expect(sentryTransactionEnvelope).toBeDefined();

    const envelopeItem = sentryTransactionEnvelope![2];

    expect(envelopeItem).toMatchObject({
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
        },
      },
      transaction: '/[id]/withServerSideProps',
      transaction_info: {
        source: 'route',
      },
      type: 'transaction',
      request: {
        url,
      },
    });
  });
});
