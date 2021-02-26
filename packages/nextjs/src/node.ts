import { init as nodeInit } from '@sentry/node';

import { MetadataBuilder } from './utils/metadataBuilder';
import { NextjsOptions } from './utils/nextjsOptions';

/** Inits the Sentry NextJS SDK on node. */
export function init(options: NextjsOptions): any {
  const metadataBuilder = new MetadataBuilder(options, ['nextjs', 'node']);
  metadataBuilder.addSdkMetadata();
  nodeInit(options);
}

export * from '@sentry/minimal';
