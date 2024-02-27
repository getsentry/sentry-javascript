import { NextTestEnv } from './utils/helpers';

describe('Error API Endpoints', () => {
  it('should capture an error event', async () => {
    const env = await NextTestEnv.init();
    const url = `${env.url}/api/error`;

    const envelope = await env.getEnvelopeRequest({
      url,
      envelopeType: 'event',
    });

    expect(envelope[2]).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'API Error',
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
      transaction: 'GET /api/error',
    });
  });

  it('should capture an erroneous transaction', async () => {
    const env = await NextTestEnv.init();
    const url = `${env.url}/api/error`;

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
      transaction: 'GET /api/error',
      type: 'transaction',
      request: {
        url,
      },
    });
  });
});
