Sentry.withActiveSpan(null, () => {
  Sentry.startSpan({ name: 'root_span' }, () => {
    transaction.startSpan({
      op: 'span_1',
      data: {
        foo: 'bar',
        baz: [1, 2, 3],
      },
    });

    // span_2 doesn't finish
    Sentry.startInactiveSpan({ op: 'span_2' });

    Sentry.startSpan({ op: 'span_3' }, () => {
      // span_4 is the child of span_3 but doesn't finish.
      Sentry.startInactiveSpan({ op: 'span_4', data: { qux: 'quux' } });

      // span_5 is another child of span_3 but finishes.
      Sentry.startInactiveSpan({ op: 'span_5' }).end();
    });
  });
});
