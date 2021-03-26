import { configureScope, init as reactInit } from '@sentry/react';

import { InitDecider } from './utils/initDecider';
import { MetadataBuilder } from './utils/metadataBuilder';
import { NextjsOptions } from './utils/nextjsOptions';

export * from '@sentry/react';

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: NextjsOptions): any {
  const metadataBuilder = new MetadataBuilder(options, ['nextjs', 'react']);
  metadataBuilder.addSdkMetadata();
  const initDecider = new InitDecider(options);
  if (initDecider.shouldInitSentry()) {
    reactInit(options);
    configureScope(scope => {
      scope.setTag('runtime', 'browser');
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn('[Sentry] Detected a non-production environment. Not initializing Sentry.');
    // eslint-disable-next-line no-console
    console.warn(
      '[Sentry] To use Sentry in development set `enableInDev: true` in next.config.js -> ' +
        '`module.exports.publicRuntimeConfig.sentry` and `module.exports.serverRuntimeConfig.sentry`',
    );
  }
}
