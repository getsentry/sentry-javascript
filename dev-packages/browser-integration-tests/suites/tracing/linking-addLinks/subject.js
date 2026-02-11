// REGULAR ---
const rootSpan1 = Sentry.startInactiveSpan({ name: 'rootSpan1' });
rootSpan1.end();

const rootSpan2 = Sentry.startInactiveSpan({ name: 'rootSpan2' });
rootSpan2.end();

Sentry.startSpan({ name: 'rootSpan3' }, rootSpan3 => {
  rootSpan3.addLinks([
    { context: rootSpan1.spanContext() },
    {
      context: rootSpan2.spanContext(),
      attributes: { 'sentry.link.type': 'previous_trace' },
    },
  ]);
});

// NESTED ---
Sentry.startSpan({ name: 'rootSpan4' }, async rootSpan4 => {
  Sentry.startSpan({ name: 'childSpan4.1' }, async childSpan1 => {
    Sentry.startSpan({ name: 'childSpan4.2' }, async childSpan2 => {
      childSpan2.addLinks([
        { context: rootSpan4.spanContext() },
        {
          context: rootSpan2.spanContext(),
          attributes: { 'sentry.link.type': 'previous_trace' },
        },
      ]);

      childSpan2.end();
    });

    childSpan1.end();
  });
});
