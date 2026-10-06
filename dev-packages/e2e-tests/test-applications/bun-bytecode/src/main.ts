/**
 * Verifies that @sentry/bun can be compiled with `bun build --compile --bytecode` without crashing at runtime.
 */
import * as Sentry from '@sentry/bun';

Sentry.init({
  dsn: 'https://username@domain/123',
  tracesSampleRate: 0,
});

console.log('Bun bytecode compilation: OK');
