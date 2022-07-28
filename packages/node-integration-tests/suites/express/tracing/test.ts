import { assertSentryTransaction, getEnvelopeRequest, runServer } from '../../../utils/index';

test('should create and send transactions for Express routes and spans for middlewares.', async () => {
  const url = await runServer(__dirname, `${__dirname}/server.ts`);
  const envelope = await getEnvelopeRequest(`${url}/express`);

  expect(envelope).toHaveLength(3);

  assertSentryTransaction(envelope[2], {
    contexts: {
      trace: {
        data: {
          url: '/test/express',
        },
        op: 'http.server',
        status: 'ok',
        tags: {
          'http.status_code': '200',
        },
      },
    },
    spans: [
      {
        description: 'corsMiddleware',
        op: 'express.middleware.use',
      },
    ],
  });
});

test('should set a correct transaction name for routes specified in RegEx', async () => {
  const url = await runServer(__dirname, `${__dirname}/server.ts`);
  const envelope = await getEnvelopeRequest(`${url}/regex`);

  expect(envelope).toHaveLength(3);

  assertSentryTransaction(envelope[2], {
    transaction: 'GET /\\/test\\/regex/',
    transaction_info: {
      source: 'route',
    },
    contexts: {
      trace: {
        data: {
          url: '/test/regex',
        },
        op: 'http.server',
        status: 'ok',
        tags: {
          'http.status_code': '200',
        },
      },
    },
  });
});
