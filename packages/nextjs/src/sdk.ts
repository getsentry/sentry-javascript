import { init as reactInit } from '@sentry/react';

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
  reactInit(options);
}
