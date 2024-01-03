async function run() {
  const transaction = Sentry.startTransaction({ name: 'test_transaction_1' });
  const span_1 = transaction.startChild({
    op: 'span_1',
    data: {
      foo: 'bar',
      baz: [1, 2, 3],
    },
  });

  await new Promise(resolve => setTimeout(resolve, 1));

  // span_1 finishes
  span_1.end();

  // span_2 doesn't finish
  const span_2 = transaction.startChild({ op: 'span_2' });
  await new Promise(resolve => setTimeout(resolve, 1));

  const span_3 = transaction.startChild({ op: 'span_3' });
  await new Promise(resolve => setTimeout(resolve, 1));

  // span_4 is the child of span_3 but doesn't finish.
  const span_4 = span_3.startChild({ op: 'span_4', data: { qux: 'quux' } });

  // span_5 is another child of span_3 but finishes.
  const span_5 = span_3.startChild({ op: 'span_5' }).end();

  // span_3 also finishes
  span_3.end();

  transaction.end();
}

run();
