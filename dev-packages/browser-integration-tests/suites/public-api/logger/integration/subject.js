console.trace('console.trace', 123, false);
console.debug('console.debug', 123, false);
console.log('console.log', 123, false);
console.info('console.info', 123, false);
console.warn('console.warn', 123, false);
console.error('console.error', 123, false);
console.assert(false, 'console.assert', 123, false);

// Test object and array truncation
console.log('Object:', { key: 'value', nested: { prop: 123 } });
console.log('Array:', [1, 2, 3, 'string']);
console.log('Mixed:', 'prefix', { obj: true }, [4, 5, 6], 'suffix');

console.log('');

Sentry.flush();
