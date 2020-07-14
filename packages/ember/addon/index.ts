import * as Sentry from '@sentry/browser';
import { addGlobalEventProcessor, SDK_VERSION } from '@sentry/browser';
import environmentConfig from 'ember-get-config';

import { assert } from '@ember/debug';

export function SentryForEmber() {
  const config = environmentConfig['@sentry/ember'];
  assert('Missing configuration for Sentry', config);

  const initConfig = Object.assign({}, config);

  createEmberEventProcessor();

  Sentry.init(initConfig);
}

function createEmberEventProcessor(): void {
  if (addGlobalEventProcessor) {
    addGlobalEventProcessor(event => {
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
