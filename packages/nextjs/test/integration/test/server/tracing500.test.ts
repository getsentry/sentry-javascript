import { NextTestEnv } from './utils/helpers';

describe('Tracing 500', () => {
  it('should capture an erroneous transaction', async () => {
    const env = await NextTestEnv.init();
    const url = `${env.url}/api/broken`;

    const envelope = await env.getEnvelopeRequest({
      url,
      envelopeType: 'transaction',
    });

    expect(envelope[2]).toMatchObject({
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
