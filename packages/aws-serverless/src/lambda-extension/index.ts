#!/usr/bin/env node
import { consoleSandbox } from '@sentry/core';
import { AwsLambdaExtension } from './aws-lambda-extension';

const extension = new AwsLambdaExtension();

async function main(): Promise<void> {
  await extension.register();

  extension.startSentryTunnel();

  // Returns on SHUTDOWN. The process is left to idle rather than exiting, so envelopes the
  // tunnel is still forwarding get their chance to land before Lambda reaps the environment.
  await extension.run();
}

main().catch(async err => {
  // The debug logger is only enabled from `Sentry.init`, and this process never calls it, so
  // nothing reported through the logger from here would ever be visible.
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.error('Sentry Lambda extension: stopped, events will no longer be tunnelled.', err);
  });

  // Reporting lets Lambda recycle the environment; `error` rethrows, and a registration that
  // never completed has no id to report with, so neither path should mask the exit.
  await extension.error('exit', err as Error).catch(() => undefined);

  // Exiting here is not optional: the tunnel server holds a referenced handle, so the process
  // would otherwise stay alive and registered while never asking for another event — and Lambda
  // holds every later invocation on this execution environment open until the function timeout.
  //
  // Deferred by one turn of the loop because `process.exit` does not wait for stderr, which is a
  // pipe under Lambda — exiting straight from the microtask above truncates the message written
  // there to a single pipe buffer.
  setImmediate(() => process.exit(1));
});
