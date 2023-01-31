import { NextTestEnv } from './utils/helpers';

describe('getInitialProps', () => {
  it('should capture a transaction', async () => {
    const env = await NextTestEnv.init();
    const url = `${env.url}/239/withInitialProps`;

    const envelope = await env.getEnvelopeRequest({
      url,
      envelopeType: 'transaction',
    });

    expect(envelope[2]).toMatchObject({
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
        },
      },
      transaction: '/[id]/withInitialProps',
      transaction_info: {
        source: 'route',
        changes: [],
        propagations: 0,
      },
      type: 'transaction',
      request: {
        url,
      },
    });
  });
});
