// Simulates a third-party import whose side effects run at module-evaluation time,
// i.e. before the client entry's body (and before hydration).
console.log('early-breadcrumb-from-imported-module');

if (typeof window !== 'undefined' && window.location.pathname === '/crash-in-imported-module') {
  throw new Error('Imported Module Side Effect Crash');
}
