import { init as browserInit } from '@sentry/browser';

import { MetadataBuilder, NextjsOptions } from './options';

/**
 * The Sentry NextJS SDK Client.
 *
 * TODO: docs, examples...
 *
 */
export function init(options: NextjsOptions): void {
  const metadataBuilder = new MetadataBuilder(options, 'nextjs');
  metadataBuilder.addSdkMetadata();
  browserInit(options);
}
