import * as Sentry from '@sentry/browser';
import { Breadcrumbs } from '@sentry/browser';

window.Sentry = Sentry;
window.breadcrumbs = [];

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new Breadcrumbs({ captureRequestPayload: true })],
  beforeBreadcrumb(breadcrumb) {
    window.breadcrumbs.push(breadcrumb);
    return breadcrumb;
  },
});
