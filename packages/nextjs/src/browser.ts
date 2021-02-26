import { init as reactInit } from '@sentry/react';

import { InitDecider } from './utils/initDecider';
import { MetadataBuilder } from './utils/metadataBuilder';
import { NextjsOptions } from './utils/nextjsOptions';

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: NextjsOptions): any {
  const metadataBuilder = new MetadataBuilder(options, ['nextjs', 'react']);
  metadataBuilder.addSdkMetadata();
  const initDecider = new InitDecider(options);
  if (initDecider.shouldInitSentry()) {
    reactInit(options);
  } else {
    // eslint-disable-next-line no-console
    console.log('[Sentry] Detected a non-production environment. Not initializing Sentry.');
  }
}

export * from '@sentry/minimal';
