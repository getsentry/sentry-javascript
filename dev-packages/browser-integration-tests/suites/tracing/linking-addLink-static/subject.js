// REGULAR ---
const rootSpan1 = Sentry.startInactiveSpan({ name: 'rootSpan1' });
rootSpan1.end();

Sentry.startSpan({ name: 'rootSpan2' }, rootSpan2 => {
  rootSpan2.addLink({
    context: rootSpan1.spanContext(),
    attributes: { 'sentry.link.type': 'previous_trace' },
  });
});

// NESTED ---
Sentry.startSpan({ name: 'rootSpan3' }, async rootSpan3 => {
  Sentry.startSpan({ name: 'childSpan3.1' }, async childSpan1 => {
    childSpan1.addLink({
      context: rootSpan1.spanContext(),
      attributes: { 'sentry.link.type': 'previous_trace' },
    });

    childSpan1.end();
  });

  Sentry.startSpan({ name: 'childSpan3.2' }, async childSpan2 => {
    childSpan2.addLink({ context: rootSpan3.spanContext() });

    childSpan2.end();
  });
});
