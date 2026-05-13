import EmberApp from 'ember-strict-application-resolver';
import EmberRouter from '@ember/routing/router';
import PageTitleService from 'ember-page-title/services/page-title';
import * as Sentry from '@sentry/ember';

// Initialize Sentry
Sentry.init({
  dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
  tracesSampleRate: 1.0,
  // Use a mock transport for dev mode
  transport: () => ({
    send: (envelope: unknown) => {
      const win = window as Window & { _sentryTestEvents?: unknown[] };
      const items =
        (envelope as [unknown, Array<[{ type: string }, unknown]>])[1] || [];
      for (const [header, payload] of items) {
        if (header.type === 'event' || header.type === 'transaction') {
          win._sentryTestEvents = win._sentryTestEvents || [];
          win._sentryTestEvents.push(payload);
        }
      }
      return Promise.resolve({});
    },
    flush: () => Promise.resolve(true),
  }),
});

class Router extends EmberRouter {
  location = 'history';
  rootURL = '/';
}

export class App extends EmberApp {
  modules = {
    './router': Router,
    './services/page-title': PageTitleService,
    ...import.meta.glob('./templates/**/*', { eager: true }),
    ...import.meta.glob('./routes/**/*', { eager: true }),
    ...import.meta.glob('./components/**/*', { eager: true }),
  };
}

Router.map(function () {
  this.route('tracing');
  this.route('replay');
  this.route('slow-loading-route', function () {
    this.route('index', { path: '/' });
  });
  this.route('with-loading', function () {
    this.route('index', { path: '/' });
  });
  this.route('with-error', function () {
    this.route('index', { path: '/' });
  });
});
