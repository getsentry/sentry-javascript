import Application from '@ember/application';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from './config/environment';
import { SentryForEmber } from '@sentry/ember';

import { Transports } from '@sentry/browser';
import { Event, Response } from '@sentry/types';
import Ember from 'ember';

class TestFetchTransport extends Transports.FetchTransport {
  public sendEvent(event: Event): PromiseLike<Response> {
    if (Ember.testing) {
      if (!window._sentryTestEvents) {
        window._sentryTestEvents = [];
      }
      window._sentryTestEvents.push(event);
      return Promise.resolve();
    }
    return super.sendEvent(event);
  }
}

SentryForEmber({ transport: TestFetchTransport });

export default class App extends Application {
  modulePrefix = config.modulePrefix;
  podModulePrefix = config.podModulePrefix;
  Resolver = Resolver;
}

loadInitializers(App, config.modulePrefix);
