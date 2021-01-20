import sinon from 'sinon';
import * as Sentry from '@sentry/browser';

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

import { getConfig } from '@embroider/macros';

function getSentryConfig() {
  return getConfig('@sentry/ember').sentryConfig;
}

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

const sentryConfig = getSentryConfig();
sentryConfig.sentry['transport'] = TestFetchTransport;

setApplication(Application.create(config.APP));

start();
QUnit.config.ignoreGlobalErrors = true;
