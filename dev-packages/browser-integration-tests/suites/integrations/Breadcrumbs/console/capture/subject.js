console.log('One');
console.warn('Two', { a: 1 });
console.error('Error 2', { b: { c: [] } });

// Passed assertions _should not_ be captured
console.assert(1 + 1 === 2, 'math works');
// Failed assertions _should_ be captured
console.assert(1 + 1 === 3, 'math broke');

Sentry.captureException('test exception');
