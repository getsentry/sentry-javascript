import * as Sentry from '@sentry/browser';
import setupSinon from 'ember-sinon-qunit';
import Application from '../app';
import config from '../config/environment';
import { setApplication } from '@ember/test-helpers';
import { start } from 'ember-qunit';
import { isTesting } from '@embroider/macros';

Sentry.addGlobalEventProcessor(event => {
  if (isTesting()) {
    if (!window._sentryTestEvents) {
      window._sentryTestEvents = [];
    }
    window._sentryTestEvents.push(event);
  }
  return event;
});

setApplication(Application.create(config.APP));

setupSinon();

start();
QUnit.config.ignoreGlobalErrors = true;
