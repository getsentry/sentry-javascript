import { configureScope, init as reactInit } from '@sentry/react';

import { InitDecider } from './utils/initDecider';
import { MetadataBuilder } from './utils/metadataBuilder';
import { NextjsOptions } from './utils/nextjsOptions';
import * as optionsHandler from './utils/optionsHandler';

export * from '@sentry/react';

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: NextjsOptions): void {
  const metadataBuilder = new MetadataBuilder(options, ['nextjs', 'react']);
  metadataBuilder.addSdkMetadata();
  const initDecider = new InitDecider(options);
  if (initDecider.shouldInitSentry()) {
    let allOptions = {};
    if (optionsHandler.areAddedBrowserOptions()) {
      allOptions = { ...options, ...optionsHandler.getBrowserOptions() };
      optionsHandler.removeBrowserOptions();
    } else {
      allOptions = options;
    }
    reactInit(allOptions);

    configureScope(scope => {
      scope.setTag('runtime', 'browser');
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn('[Sentry] Detected a non-production environment. Not initializing Sentry.');
    // eslint-disable-next-line no-console
    console.warn('[Sentry] To use Sentry also in development set `dev: true` in the options.');
  }
}

/** Adds the config that couldnt be added to the init. */
export function addBrowserConfig(options: any): void {
  optionsHandler.addBrowserOptions(options);
}
