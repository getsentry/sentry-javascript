const chicken = {};
const egg = { contains: chicken };
chicken.lays = egg;

Sentry.startSpan({ name: 'circular_object_test_transaction', data: { chicken } }, () => {
  Sentry.startSpan({ op: 'circular_object_test_span', data: { chicken } }, () => undefined);
});
