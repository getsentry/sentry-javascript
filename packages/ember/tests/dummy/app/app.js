import Application from '@ember/application';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from './config/environment';
import * as Sentry from '@sentry/ember';

import Ember from 'ember';

Sentry.init();

Sentry.addGlobalEventProcessor((event) => {
  if (Ember.testing) {
    if (!window._sentryTestEvents) {
      window._sentryTestEvents = [];
    }
    window._sentryTestEvents.push(event);
  }
  return event;
});

export default class App extends Application {
  modulePrefix = config.modulePrefix;
  podModulePrefix = config.podModulePrefix;
  Resolver = Resolver;
}

loadInitializers(App, config.modulePrefix);
