import { init as reactInit } from '@sentry/react';

import { InitDecider } from './utils/initDecider';
import { MetadataBuilder } from './utils/metadataBuilder';
import { NextjsOptions } from './utils/nextjsOptions';

/**
 * The Sentry NextJS SDK Client.
 *
 * TODO: docs, examples...
 *
 */
export function init(options: NextjsOptions): void {
  const metadataBuilder = new MetadataBuilder(options, ['nextjs']);
  metadataBuilder.addSdkMetadata();
  const initDecider = new InitDecider(options);
  if (initDecider.shouldInitSentry()) {
    reactInit(options);
  } else {
    // eslint-disable-next-line no-console
    console.log('[Sentry] Detected a non-production environment. Not initializing Sentry.');
  }
}
