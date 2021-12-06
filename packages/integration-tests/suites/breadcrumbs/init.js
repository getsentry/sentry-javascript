import * as Sentry from '@sentry/browser';
import { normalize } from '@sentry/utils';

window.Sentry = Sentry;
window.events = [];

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new Sentry.Integrations.Dedupe()],
  attachStacktrace: true,
  ignoreErrors: ['ignoreErrorTest'],
  denyUrls: ['foo.js'],
  beforeBreadcrumb: function(breadcrumb, breadcrumbHint) {
    // Remove circular properties from event target
    // Store `breadcrumbHint` inside `breadcrumb` for tests
    if (breadcrumbHint) {
      breadcrumb.hint = normalize(breadcrumbHint);
    }

    return breadcrumb;
  },
});

const scope = Sentry.getCurrentHub().getScope();

scope.addEventProcessor(function(event) {
  window.events.push(event);
  return event;
});
