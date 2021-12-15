const three = new SyntaxError('three');

const two = new TypeError('two');
two.reason = three;

const one = new Error('one');
one.reason = two;

Sentry.captureException(one);
