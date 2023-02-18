import { NextTestEnv } from './utils/helpers';

describe('tracingServerGetServerSidePropsCustomPageExtension', () => {
  it('should capture a transaction', async () => {
    const env = await NextTestEnv.init();
    const url = `${env.url}/customPageExtension`;

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
      transaction: '/customPageExtension',
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
