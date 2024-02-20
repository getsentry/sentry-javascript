Sentry.startSpan({ name: 'root_span' }, () => {
  Sentry.startSpan(
    {
      name: 'span_1',
      data: {
        foo: 'bar',
        baz: [1, 2, 3],
      },
    },
    () => undefined,
  );

  // span_2 doesn't finish
  Sentry.startInactiveSpan({ name: 'span_2' });

  Sentry.startSpan({ name: 'span_3' }, () => {
    // span_4 is the child of span_3 but doesn't finish.
    Sentry.startInactiveSpan({ name: 'span_4', data: { qux: 'quux' } });

    // span_5 is another child of span_3 but finishes.
    Sentry.startInactiveSpan({ name: 'span_5' }).end();
  });
});
