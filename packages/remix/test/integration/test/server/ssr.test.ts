import { RemixTestEnv, assertSentryEvent, assertSentryTransaction } from './utils/helpers';

const useV2 = process.env.REMIX_VERSION === '2';

describe('Server Side Rendering', () => {
  it('correctly reports a server side rendering error', async () => {
    const env = await RemixTestEnv.init('builtin');
    const url = `${env.url}/ssr-error`;
    const envelopes = await env.getMultipleEnvelopeRequest({ url, count: 2, envelopeType: ['transaction', 'event'] });
    const [transaction] = envelopes.filter(envelope => envelope[1].type === 'transaction');
    const [event] = envelopes.filter(envelope => envelope[1].type === 'event');

    assertSentryTransaction(transaction[2], {
      contexts: {
        trace: {
          status: 'internal_error',
          data: {
            'http.response.status_code': 500,
          },
        },
      },
    });

    assertSentryEvent(event[2], {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Sentry SSR Test Error',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: useV2 ? 'remix.server.handleError' : 'documentRequest',
              },
              handled: false,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });
});
