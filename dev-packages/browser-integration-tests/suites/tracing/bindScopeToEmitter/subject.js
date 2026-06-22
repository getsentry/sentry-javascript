// A browser-native event target.
const target = new EventTarget();

const parentSpan = Sentry.startInactiveSpan({ name: 'parent' });

// Bind + register the listener while `parentSpan` is the active span.
Sentry.withActiveSpan(parentSpan, () => {
  Sentry.bindScopeToEmitter(target);

  target.addEventListener('data', () => {
    Sentry.startSpan({ name: 'child-bound' }, () => {
      // noop
    });
  });
});

// At this point no span is active. Dispatching should re-enter the bound (parent) scope,
// so `child-bound` is nested under `parent` rather than starting its own trace.
target.dispatchEvent(new Event('data'));

parentSpan.end();
