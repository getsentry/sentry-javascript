import { configureScope, init as reactInit } from '@sentry/react';

import { MetadataBuilder } from './utils/metadataBuilder';
import { NextjsOptions } from './utils/nextjsOptions';

export * from '@sentry/react';

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: NextjsOptions): void {
  const metadataBuilder = new MetadataBuilder(options, ['nextjs', 'react']);
  metadataBuilder.addSdkMetadata();
  reactInit(options);
  configureScope(scope => {
    scope.setTag('runtime', 'browser');
  });
}
