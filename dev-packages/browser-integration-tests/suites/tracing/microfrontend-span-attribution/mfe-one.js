import * as Sentry from '@sentry/browser';

export function mount() {
  Sentry.withScope(scope => {
    scope.setTag('mfe.name', 'mfe-one');
    fetch('http://sentry-test-site.example/api/todos/2');
  });
}
