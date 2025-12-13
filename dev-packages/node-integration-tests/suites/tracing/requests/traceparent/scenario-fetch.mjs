import * as Sentry from '@sentry/node';

async function run() {
  // Wrap in span that is not sampled
  await Sentry.startSpan({ name: 'outer' }, async () => {
    await fetch(`${process.env.SERVER_URL}/api/v1`).then(res => res.text());
  });
}

run();
