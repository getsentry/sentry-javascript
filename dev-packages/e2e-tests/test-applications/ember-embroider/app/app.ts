import Application from '@ember/application';
import * as Sentry from '@sentry/ember';
import config from 'ember-embroider/config/environment';
import loadInitializers from 'ember-load-initializers';
import Resolver from 'ember-resolver';

Sentry.init({
  replaysSessionSampleRate: 1,
  replaysOnErrorSampleRate: 1,
  tunnel: `http://localhost:3031/`, // proxy server
});
export default class App extends Application {
  modulePrefix = config.modulePrefix;
  podModulePrefix = config.podModulePrefix;
  Resolver = Resolver;
}

loadInitializers(App, config.modulePrefix);
