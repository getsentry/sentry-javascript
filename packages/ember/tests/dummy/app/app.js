import Application from '@ember/application';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from './config/environment';
import * as Sentry from '@sentry/ember';

Sentry.init({
  replaysSessionSampleRate: 1,
  replaysOnErrorSampleRate: 1,
  browserTracingOptions: {
    _experiments: {
      // This lead to some flaky tests, as that is sometimes logged
      enableLongTask: false,
    },
  },
});

export default class App extends Application {
  modulePrefix = config.modulePrefix;
  podModulePrefix = config.podModulePrefix;
  Resolver = Resolver;
}

loadInitializers(App, config.modulePrefix);
