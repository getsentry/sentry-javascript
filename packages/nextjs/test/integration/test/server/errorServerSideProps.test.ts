import { NextTestEnv } from './utils/helpers';

describe('Error Server-side Props', () => {
  it('should capture an error event', async () => {
    const env = await NextTestEnv.init();
    const url = `${env.url}/withErrorServerSideProps`;

    const envelope = await env.getEnvelopeRequest({
      url,
      envelopeType: 'event',
    });

    expect(envelope[2]).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'ServerSideProps Error',
          },
        ],
      },
      tags: {
        runtime: 'node',
      },
      request: {
        url,
        method: 'GET',
      },
    });
  });

  it('should capture an erroneous transaction', async () => {
    const env = await NextTestEnv.init();
    const url = `${env.url}/withErrorServerSideProps`;

    const envelope = await env.getEnvelopeRequest({
      url,
      envelopeType: 'transaction',
    });

    expect(envelope[2]).toMatchObject({
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
        },
      },
      transaction: '/withErrorServerSideProps',
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
