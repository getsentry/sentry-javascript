import { assertSentryTransaction, getEnvelopeRequest, runServer } from '../../../utils/index';

test('should create and send transactions for Express routes and spans for middlewares.', async () => {
  const { url, server, scope } = await runServer(__dirname, `${__dirname}/server.ts`);
  const envelope = await getEnvelopeRequest({ url: `${url}/express`, server, scope });

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
  const { url, server, scope } = await runServer(__dirname, `${__dirname}/server.ts`);
  const envelope = await getEnvelopeRequest({ url: `${url}/regex`, server, scope });

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

test.each([['array1'], ['array5']])(
  'should set a correct transaction name for routes consisting of arrays of routes',
  async segment => {
    const { url, server, scope } = await runServer(__dirname, `${__dirname}/server.ts`);
    const envelope = await getEnvelopeRequest({ url: `${url}/${segment}`, server, scope });

    expect(envelope).toHaveLength(3);

    assertSentryTransaction(envelope[2], {
      transaction: 'GET /test/array1,/\\/test\\/array[2-9]',
      transaction_info: {
        source: 'route',
      },
      contexts: {
        trace: {
          data: {
            url: `/test/${segment}`,
          },
          op: 'http.server',
          status: 'ok',
          tags: {
            'http.status_code': '200',
          },
        },
      },
    });
  },
);

test.each([
  ['arr/545'],
  ['arr/required'],
  ['arr/required'],
  ['arr/requiredPath'],
  ['arr/required/lastParam'],
  ['arr55/required/lastParam'],
  ['arr/requiredPath/optionalPath/'],
  ['arr/requiredPath/optionalPath/lastParam'],
])('should handle more complex regexes in route arrays correctly', async segment => {
  const { url, server, scope } = await runServer(__dirname, `${__dirname}/server.ts`);
  const envelope = await getEnvelopeRequest({ url: `${url}/${segment}`, server, scope });

  expect(envelope).toHaveLength(3);

  assertSentryTransaction(envelope[2], {
    transaction: 'GET /test/arr/:id,/\\/test\\/arr[0-9]*\\/required(path)?(\\/optionalPath)?\\/(lastParam)?',
    transaction_info: {
      source: 'route',
    },
    contexts: {
      trace: {
        data: {
          url: `/test/${segment}`,
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
