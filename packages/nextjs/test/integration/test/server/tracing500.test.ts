import { NextTestEnv } from './utils/helpers';

describe('Tracing 500', () => {
  it('should capture an erroneous transaction', async () => {
    const env = await NextTestEnv.init();
    const url = `${env.url}/api/broken`;

    const envelopes = await env.getMultipleEnvelopeRequest({
      url,
      envelopeType: 'transaction',
      count: 2, // We will receive 2 transactions - one from Next.js instrumentation and one from our SDK
    });

    const sentryTransactionEnvelope = envelopes.find(envelope => {
      const envelopeItem = envelope[2];
      return envelopeItem.transaction === 'GET /api/broken';
    });

    expect(sentryTransactionEnvelope).toBeDefined();

    const envelopeItem = sentryTransactionEnvelope![2];

    expect(envelopeItem).toMatchObject({
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
          data: {
            'http.response.status_code': 500,
          },
        },
      },
      transaction: 'GET /api/broken',
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
