import EmberApp from 'ember-strict-application-resolver';
import EmberRouter from '@ember/routing/router';
import * as QUnit from 'qunit';
import { setApplication } from '@ember/test-helpers';
import { setup } from 'qunit-dom';
import { start as qunitStart, setupEmberOnerrorValidation } from 'ember-qunit';
import PageTitleService from 'ember-page-title/services/page-title';
import * as Sentry from '@sentry/ember';
import { replayIntegration } from '@sentry/ember';

// Initialize Sentry
Sentry.init({
  dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [replayIntegration()],
  // Use a mock transport for testing
  transport: () => ({
    send: (envelope: unknown) => {
      // Extract event items from the envelope and store them
      const items =
        (envelope as [unknown, Array<[{ type: string }, unknown]>])[1] || [];
      for (const [header, payload] of items) {
        if (header.type === 'event' || header.type === 'transaction') {
          window._sentryTestEvents = window._sentryTestEvents || [];
          window._sentryTestEvents.push(payload);
        }
      }
      return Promise.resolve({});
    },
    flush: () => Promise.resolve(true),
  }),
});

class Router extends EmberRouter {
  location = 'none';
  rootURL = '/';
}

// Transform glob imports to have correct module names for the resolver
// and extract the default export if present
function normalizeGlobModulesWithDefault(
  glob: Record<string, Record<string, unknown>>,
  basePath: string,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [path, mod] of Object.entries(glob)) {
    // Transform ../demo-app/templates/index.gts -> ./templates/index
    const normalizedPath = path
      .replace(basePath + '/', './')
      .replace(/\.gts$/, '')
      .replace(/\.ts$/, '');
    // Use the default export if present, otherwise the whole module
    normalized[normalizedPath] = mod.default ?? mod;
  }
  return normalized;
}

const templates = import.meta.glob('../demo-app/templates/**/*', {
  eager: true,
}) as Record<string, Record<string, unknown>>;
const routes = import.meta.glob('../demo-app/routes/**/*', {
  eager: true,
}) as Record<string, Record<string, unknown>>;
const components = import.meta.glob('../demo-app/components/**/*', {
  eager: true,
}) as Record<string, Record<string, unknown>>;

class TestApp extends EmberApp {
  modules = {
    './router': Router,
    './services/page-title': PageTitleService,
    ...normalizeGlobModulesWithDefault(templates, '../demo-app'),
    ...normalizeGlobModulesWithDefault(routes, '../demo-app'),
    ...normalizeGlobModulesWithDefault(components, '../demo-app'),
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

export function start() {
  setApplication(
    TestApp.create({
      autoboot: false,
      rootElement: '#ember-testing',
    }),
  );
  setup(QUnit.assert);
  setupEmberOnerrorValidation();
  qunitStart();
}
