console.trace('console.trace', 123, false);
console.debug('console.debug', 123, false);
console.log('console.log', 123, false);
console.info('console.info', 123, false);
console.warn('console.warn', 123, false);
console.error('console.error', 123, false);
console.assert(false, 'console.assert', 123, false);

console.log('');

Sentry.flush();
