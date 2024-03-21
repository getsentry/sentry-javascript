import nock from 'nock';
import { NextTestEnv } from './utils/helpers';

describe('Tracing HTTP', () => {
  it('should capture a transaction', async () => {
    const env = await NextTestEnv.init();
    const url = `${env.url}/api/http`;

    // this intercepts the outgoing request made by the route handler (which it makes in order to test span creation)
    nock('http://example.com').get('/').reply(200, 'ok');

    const envelopes = await env.getMultipleEnvelopeRequest({
      url,
      envelopeType: 'transaction',
      count: 2, // We will receive 2 transactions - one from Next.js instrumentation and one from our SDK
    });

    const sentryTransactionEnvelope = envelopes.find(envelope => {
      const envelopeItem = envelope[2];
      return envelopeItem.transaction === 'GET /api/http';
    });

    expect(sentryTransactionEnvelope).toBeDefined();

    const envelopeItem = sentryTransactionEnvelope![2];

    expect(envelopeItem).toMatchObject({
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
          data: {
            'http.response.status_code': 200,
          },
        },
      },
      spans: [
        {
          description: 'GET http://example.com/',
          op: 'http.client',
          status: 'ok',
          data: {
            'http.response.status_code': 200,
          },
        },
      ],
      transaction: 'GET /api/http',
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
