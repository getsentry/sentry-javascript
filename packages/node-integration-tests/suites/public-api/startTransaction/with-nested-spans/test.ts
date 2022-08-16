import { assertSentryTransaction, getEnvelopeRequest, runServer } from '../../../../utils';

test('should report finished spans as children of the root transaction.', async () => {
  const config = await runServer(__dirname);
  const envelope = await getEnvelopeRequest(config);

  expect(envelope).toHaveLength(3);

  const rootSpanId = (envelope?.[2] as any)?.contexts?.trace?.span_id;
  const span3Id = (envelope?.[2] as any)?.spans?.[1].span_id;

  expect(rootSpanId).toEqual(expect.any(String));
  expect(span3Id).toEqual(expect.any(String));

  assertSentryTransaction(envelope[2], {
    transaction: 'test_transaction_1',
    spans: [
      {
        op: 'span_1',
        data: {
          foo: 'bar',
          baz: [1, 2, 3],
        },
        parent_span_id: rootSpanId,
      },
      {
        op: 'span_3',
        parent_span_id: rootSpanId,
      },
      {
        op: 'span_5',
        parent_span_id: span3Id,
      },
    ],
  });
});
