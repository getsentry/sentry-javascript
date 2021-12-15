const three = new SyntaxError('three');

const two = new TypeError('two');
two.cause = three;

const one = new Error('one');
one.cause = two;

Sentry.captureException(one);
