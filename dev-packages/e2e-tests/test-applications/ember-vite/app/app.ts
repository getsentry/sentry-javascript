import Application from '@ember/application';
import compatModules from '@embroider/virtual/compat-modules';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import setupInspector from '@embroider/legacy-inspector-support/ember-source-4.12';
import * as Sentry from '@sentry/ember';

import config from 'ember-vite/config/environment';

Sentry.init({
  dsn: config.sentryDsn,
  tracesSampleRate: 1,
  replaysSessionSampleRate: 1,
  replaysOnErrorSampleRate: 1,
  tracePropagationTargets: ['localhost', 'doesntexist.example'],
  tunnel: `http://localhost:3031/`, // proxy server
});

export default class App extends Application {
  modulePrefix = config.modulePrefix;
  podModulePrefix = config.podModulePrefix;
  Resolver = Resolver.withModules(compatModules);
  inspector = setupInspector(this);
}

loadInitializers(App, config.modulePrefix, compatModules);
