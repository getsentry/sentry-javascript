const rootSpan1 = Sentry.startInactiveSpan({ name: 'rootSpan1' });
rootSpan1.end();

const rootSpan2 = Sentry.startInactiveSpan({ name: 'rootSpan2' });
rootSpan2.end();

Sentry.startSpan(
  {
    name: 'rootSpan3',
    links: [
      { context: rootSpan1.spanContext() },
      { context: rootSpan2.spanContext(), attributes: { 'sentry.link.type': 'previous_trace' } },
    ],
  },
  async () => {
    Sentry.startSpan({ name: 'childSpan3.1' }, async childSpan1 => {
      childSpan1.end();
    });
  },
);
