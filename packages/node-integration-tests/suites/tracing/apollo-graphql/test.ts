import { TestEnv, assertSentryTransaction, conditionalTest } from '../../../utils';

// Node 10 is not supported by `graphql-js`
// Ref: https://github.com/graphql/graphql-js/blob/main/package.json
conditionalTest({ min: 12 })('GraphQL/Apollo Tests', () => {
  test('should instrument GraphQL and Apollo Server.', async () => {
    const env = await TestEnv.init(__dirname);
    const envelope = await env.getEnvelopeRequest({ envelopeType: 'transaction' });

    expect(envelope).toHaveLength(3);

    const transaction = envelope[2];
    const parentSpanId = (transaction as any)?.contexts?.trace?.span_id;
    const graphqlSpanId = (transaction as any)?.spans?.[0].span_id;

    expect(parentSpanId).toBeDefined();
    expect(graphqlSpanId).toBeDefined();

    assertSentryTransaction(transaction, {
      transaction: 'test_transaction',
      spans: [
        {
          description: 'execute',
          op: 'graphql.execute',
          parent_span_id: parentSpanId,
        },
        {
          description: 'Query.hello',
          op: 'graphql.resolve',
          parent_span_id: graphqlSpanId,
        },
      ],
    });
  });
});
