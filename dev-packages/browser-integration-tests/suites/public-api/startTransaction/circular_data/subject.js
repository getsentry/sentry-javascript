const chicken = {};
const egg = { contains: chicken };
chicken.lays = egg;

const transaction = Sentry.startTransaction({ name: 'circular_object_test_transaction', data: { chicken } });
const span = transaction.startChild({ op: 'circular_object_test_span', data: { chicken } });

span.end();
transaction.end();
