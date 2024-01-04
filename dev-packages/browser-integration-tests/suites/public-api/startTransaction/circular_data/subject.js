const chicken = {};
const egg = { contains: chicken };
chicken.lays = egg;

const circularObject = chicken;

const transaction = Sentry.startTransaction({ name: 'circular_object_test_transaction', data: circularObject });
const span = transaction.startChild({ op: 'circular_object_test_span', data: circularObject });

span.end();
transaction.end();
