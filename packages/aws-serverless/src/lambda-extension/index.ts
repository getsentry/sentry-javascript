#!/usr/bin/env node
import { consoleSandbox } from '@sentry/core';
import { AwsLambdaExtension } from './aws-lambda-extension';

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
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.error('Error in Lambda Extension', err);
  });
  process.exit(1);
});
