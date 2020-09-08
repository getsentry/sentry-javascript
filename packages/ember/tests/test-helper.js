import sinon from 'sinon';
import * as Sentry from '@sentry/browser';
import environmentConfig from 'ember-get-config';

/**
 * Stub Sentry init function before application is imported to avoid actually setting up Sentry and needing a DSN
 */
sinon.stub(Sentry, 'init');

import Application from '../app';
import config from '../config/environment';
import { setApplication } from '@ember/test-helpers';
import { start } from 'ember-qunit';
import { Transports } from '@sentry/browser';
import Ember from 'ember';

export class TestFetchTransport extends Transports.FetchTransport {
  sendEvent(event) {
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

environmentConfig['@sentry/ember'].sentry['transport'] = TestFetchTransport;

setApplication(Application.create(config.APP));

start();
QUnit.config.ignoreGlobalErrors = true;
