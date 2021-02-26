import { init as reactInit } from '@sentry/react';

import { MetadataBuilder } from './utils/metadataBuilder';
import { NextjsOptions } from './utils/nextjsOptions';

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: NextjsOptions): any {
  const metadataBuilder = new MetadataBuilder(options, ['nextjs', 'react']);
  metadataBuilder.addSdkMetadata();
  reactInit(options);
}

export * from '@sentry/minimal';
