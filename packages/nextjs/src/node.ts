import { init as nodeInit } from '@sentry/node';

import { InitDecider } from './utils/initDecider';
import { MetadataBuilder } from './utils/metadataBuilder';
import { NextjsOptions } from './utils/nextjsOptions';

/** Inits the Sentry NextJS SDK on node. */
export function init(options: NextjsOptions): any {
  const metadataBuilder = new MetadataBuilder(options, ['nextjs', 'node']);
  metadataBuilder.addSdkMetadata();
  const initDecider = new InitDecider(options);
  if (initDecider.shouldInitSentry()) {
    nodeInit(options);
  } else {
    // eslint-disable-next-line no-console
    console.log('[Sentry] Detected a non-production environment. Not initializing Sentry.');
  }
}

export * from '@sentry/minimal';
