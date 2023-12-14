import { NextTestEnv } from './utils/helpers';

const cases = [
  {
    name: 'unwrappedNoParamURL',
    url: '/api/wrapApiHandlerWithSentry/unwrapped/noParams',
    transactionName: '/api/wrapApiHandlerWithSentry/unwrapped/noParams',
  },
  {
    name: 'unwrappedDynamicURL',
    url: '/api/wrapApiHandlerWithSentry/unwrapped/dog',
    transactionName: '/api/wrapApiHandlerWithSentry/unwrapped/[animal]',
  },
  {
    name: 'unwrappedCatchAllURL',
    url: '/api/wrapApiHandlerWithSentry/unwrapped/dog/facts',
    transactionName: '/api/wrapApiHandlerWithSentry/unwrapped/[...pathParts]',
  },
  {
    name: 'wrappedNoParamURL',
    url: '/api/wrapApiHandlerWithSentry/wrapped/noParams',
    transactionName: '/api/wrapApiHandlerWithSentry/wrapped/noParams',
  },
  {
    name: 'wrappedDynamicURL',
    url: '/api/wrapApiHandlerWithSentry/wrapped/dog',
    transactionName: '/api/wrapApiHandlerWithSentry/wrapped/[animal]',
  },
  {
    name: 'wrappedCatchAllURL',
    url: '/api/wrapApiHandlerWithSentry/wrapped/dog/facts',
    transactionName: '/api/wrapApiHandlerWithSentry/wrapped/[...pathParts]',
  },
];

describe('getServerSideProps', () => {
  it.each(cases)('should capture a transaction for %s', async ({ url, transactionName }) => {
    const env = await NextTestEnv.init();

    const fullUrl = `${env.url}${url}`;

    const envelope = await env.getEnvelopeRequest({
      url: fullUrl,
      envelopeType: 'transaction',
    });

    expect(envelope[2]).toMatchObject({
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
        },
      },
      transaction: `GET ${transactionName}`,
      transaction_info: {
        source: 'route',
      },
      type: 'transaction',
      request: {
        url: fullUrl,
      },
    });
  });
});
