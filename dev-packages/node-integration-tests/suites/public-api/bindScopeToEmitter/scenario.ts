import { EventEmitter } from 'node:events';
import type { Span } from '@sentry/core';
import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [],
  transport: loggingTransport,
});

const boundEmitter = new EventEmitter();
const unboundEmitter = new EventEmitter();

let parentSpan: Span;

Sentry.startSpanManual({ name: 'parent' }, span => {
  parentSpan = span;

  // Bind the current (parent) scope to the emitter. Listeners registered afterwards should run
  // with the parent span active, even when they fire in a different async context.
  Sentry.bindScopeToEmitter(boundEmitter);

  boundEmitter.on('data', () => {
    Sentry.startSpan({ name: 'child-bound' }, () => undefined);
  });

  // The unbound emitter is the control: its listener should NOT see the parent span.
  unboundEmitter.on('data', () => {
    Sentry.startSpan({ name: 'child-unbound' }, () => undefined);
  });
});

// Emit from a fresh async context (a timer scheduled at the top level), where the parent span is
// no longer active. Only the bound emitter should re-enter the parent scope.
setTimeout(() => {
  unboundEmitter.emit('data');
  boundEmitter.emit('data');
  parentSpan.end();
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  Sentry.flush();
}, 10);
