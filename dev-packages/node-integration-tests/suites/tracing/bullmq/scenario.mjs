import * as Sentry from '@sentry/node';
import { Queue, Worker } from 'bullmq';

const telemetry = new Sentry.BullMQTelemetry();
const connection = { host: '127.0.0.1', port: 6380 };

async function run() {
  const queue = new Queue('test-queue', { connection, telemetry });

  const worker = new Worker(
    'test-queue',
    async () => {
      // job processed
    },
    { connection, telemetry },
  );

  const jobProcessed = new Promise(resolve => {
    worker.on('completed', () => resolve());
  });

  await Sentry.startSpan({ name: 'enqueue test-job' }, async () => {
    await queue.add('test-job', { data: 'test-data' });
  });

  await jobProcessed;
  await worker.close();
  await queue.close();
  await Sentry.flush();
}

run();
