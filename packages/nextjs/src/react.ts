import { configureScope, init as reactInit } from '@sentry/react';

import { MetadataBuilder } from './utils/metadataBuilder';
import { NextjsOptions } from './utils/nextjsOptions';

export * from '@sentry/react';

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: NextjsOptions): any {
  const metadataBuilder = new MetadataBuilder(options, ['nextjs', 'react']);
  metadataBuilder.addSdkMetadata();
  if (isProdEnv()) {
    reactInit(options);
    configureScope(scope => {
      scope.setTag('runtime', 'browser');
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn('[Sentry] Detected a non-production environment. Not initializing Sentry.');
  }
}

function isProdEnv(): boolean {
  return process.env.NODE_ENV !== undefined && process.env.NODE_ENV === 'production';
}
