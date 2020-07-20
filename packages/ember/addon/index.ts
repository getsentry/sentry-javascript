import * as Sentry from '@sentry/browser';
import { addGlobalEventProcessor, SDK_VERSION } from '@sentry/browser';
import environmentConfig from 'ember-get-config';

import { run } from '@ember/runloop';
import { assert, warn, runInDebug } from '@ember/debug';
import Ember from 'ember';

export function SentryForEmber() {
  const config = environmentConfig['@sentry/ember'];
  assert('Missing configuration for Sentry', config);

  const initConfig = Object.assign({}, config);

  createEmberEventProcessor();

  Sentry.init(initConfig);

  runInDebug(() => {
    run.next(() => {
      warn(
        'Ember.onerror found. Using Ember.onerror can hide some errors (such as flushed runloop errors) from Sentry. Use Sentry.captureException to capture errors within Ember.onError or remove it to have errors caught by Sentry directly.',
        !Ember.onerror,
        {
          id: '@sentry/ember.ember-onerror-detected',
        },
      );
    });
  });
}

function createEmberEventProcessor(): void {
  if (addGlobalEventProcessor) {
    addGlobalEventProcessor((event) => {
      event.sdk = {
        ...event.sdk,
        name: 'sentry.javascript.ember',
        packages: [
          ...((event.sdk && event.sdk.packages) || []),
          {
            name: 'npm:@sentry/ember',
            version: SDK_VERSION,
          },
        ],
        version: SDK_VERSION,
      };

      return event;
    });
  }
}

export * from '@sentry/browser';
