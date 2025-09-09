#!/usr/bin/env node
import { debug } from '@sentry/core';
import { AwsLambdaExtension } from './aws-lambda-extension';
import { DEBUG_BUILD } from './debug-build';

async function main(): Promise<void> {
  const extension = new AwsLambdaExtension();

  await extension.register();

  extension.startSentryTunnel();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await extension.next();
  }
}

main().catch(err => {
  DEBUG_BUILD && debug.error('Error in Lambda Extension', err);
});
