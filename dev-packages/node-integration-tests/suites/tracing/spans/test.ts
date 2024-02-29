import nock from 'nock';

import { TestEnv, assertSentryTransaction } from '../../../utils';

test('should capture spans for outgoing http requests', async () => {
  const match1 = nock('http://match-this-url.com').get('/api/v0').reply(200);
  const match2 = nock('http://match-this-url.com').get('/api/v1').reply(200);

  const env = await TestEnv.init(__dirname);
  const envelope = await env.getEnvelopeRequest({ envelopeType: 'transaction' });

  expect(match1.isDone()).toBe(true);
  expect(match2.isDone()).toBe(true);

  expect(envelope).toHaveLength(3);

  assertSentryTransaction(envelope[2], {
    transaction: 'test_transaction',
    spans: [
      {
        description: 'GET http://match-this-url.com/api/v0',
        op: 'http.client',
        origin: 'auto.http.node.http',
        status: 'ok',
      },
      {
        description: 'GET http://match-this-url.com/api/v1',
        op: 'http.client',
        origin: 'auto.http.node.http',
        status: 'ok',
      },
    ],
  });
});
