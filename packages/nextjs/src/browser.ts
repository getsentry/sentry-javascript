import { init as browserInit } from '@sentry/browser';

import { MetadataBuilder, NextjsOptions } from './options';

/** Inits the Sentry NextJS SDK on the browser. */
export function init(options: NextjsOptions): any {
  const metadataBuilder = new MetadataBuilder(options, ['nextjs', 'browser']);
  metadataBuilder.addSdkMetadata();
  browserInit(options);
}

export * from '@sentry/minimal';
