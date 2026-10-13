#!/usr/bin/env node
import { consoleSandbox } from '@sentry/core';
import { AwsLambdaExtension } from './aws-lambda-extension';

export const POLL_RETRY_DELAYS = [100, 200, 400] as const;

async function main(): Promise<void> {
  const extension = new AwsLambdaExtension();

  await extension.register();

  extension.startSentryTunnel();

  let failures = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await extension.next();
      failures = 0;
    } catch (err) {
      const delay = POLL_RETRY_DELAYS[failures++];
      const code = (err as NodeJS.ErrnoException | undefined)?.code;

      if (
        delay === undefined ||
        !code ||
        !['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code)
      ) {
        throw err;
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

main().catch(err => {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.error('Error in Lambda Extension', err);
  });
  process.exit(1);
});
