import * as Sentry from '@sentry/node';

const tracer = Sentry.getClient().tracer;

async function run() {
  await tracer.startActiveSpan('test span name', async span => {
    try {
      throw new Error('Test error from tracer.startActiveSpan');
    } finally {
      span.end();
    }
  });
}

run();
