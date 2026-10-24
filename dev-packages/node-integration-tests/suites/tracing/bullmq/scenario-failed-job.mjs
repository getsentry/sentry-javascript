import * as Sentry from '@sentry/node';
import { Queue, Worker } from 'bullmq';

const telemetry = new Sentry.BullMQTelemetry();
const connection = { host: '127.0.0.1', port: 6384 };

async function run() {
  const queue = new Queue('test-failed-queue', { connection, telemetry });

  const worker = new Worker(
    'test-failed-queue',
    async () => {
      throw new Error('Job failed on purpose');
    },
    { connection, telemetry },
  );

  const jobFailed = new Promise(resolve => {
    worker.on('failed', () => resolve());
  });

  await queue.add('failing-job', { data: 'test-data' });

  await jobFailed;
  await worker.close();
  await queue.close();
  await Sentry.flush();
}

run();
