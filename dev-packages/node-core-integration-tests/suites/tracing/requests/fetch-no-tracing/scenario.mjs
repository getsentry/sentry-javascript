import * as Sentry from '@sentry/node-core';

async function run() {
  await fetch(`${process.env.SERVER_URL}/api/v0`).then(res => res.text());
  await fetch(`${process.env.SERVER_URL}/api/v1`).then(res => res.text());
  await fetch(`${process.env.SERVER_URL}/api/v2`).then(res => res.text());
  await fetch(`${process.env.SERVER_URL}/api/v3`).then(res => res.text());

  Sentry.captureException(new Error('foo'));
}

run();
