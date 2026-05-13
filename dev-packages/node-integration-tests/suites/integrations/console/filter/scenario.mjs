/* eslint-disable no-console */
import * as Sentry from '@sentry/node';

console.log('hello');
console.log('foo');
console.log('foo2');
console.log('baz');

Sentry.captureException(new Error('Test Error'));
