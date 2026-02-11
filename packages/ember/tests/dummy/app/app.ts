import Application from '@ember/application';
import * as Sentry from '@sentry/ember';
import loadInitializers from 'ember-load-initializers';
import Resolver from 'ember-resolver';
import config from './config/environment';

Sentry.init({
  replaysSessionSampleRate: 1,
  replaysOnErrorSampleRate: 1,
});

export default class App extends Application {
  public modulePrefix = config.modulePrefix;
  public podModulePrefix = config.podModulePrefix;
  public Resolver = Resolver;
}

loadInitializers(App, config.modulePrefix);
