import { setApplication } from '@ember/test-helpers';
import { isTesting } from '@embroider/macros';
import * as Sentry from '@sentry/browser';
import Application from 'dummy/app';
import config from 'dummy/config/environment';
import { start } from 'ember-qunit';
import setupSinon from 'ember-sinon-qunit';

declare global {
  interface Window {
    _sentryTestEvents: Sentry.Event[];
    _sentryPerformanceLoad?: Promise<void>;
  }
}

Sentry.addEventProcessor(event => {
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
// @ts-expect-error TODO: Is this needed ???
QUnit.config.ignoreGlobalErrors = true;
