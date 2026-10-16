import * as Sentry from '@sentry/node';
import { Queue, Worker } from 'bullmq';

const telemetry = new Sentry.BullMQTelemetry({ enableMetrics: true });
const connection = { host: '127.0.0.1', port: 6384 };

async function run() {
  const queue = new Queue('test-queue', { connection, telemetry });

  const worker = new Worker(
    'test-queue',
    async () => {
      // job processed
    },
    { connection, telemetry },
  );

  const jobsProcessed = new Promise(resolve => {
    let completed = 0;
    worker.on('completed', () => {
      completed++;
      if (completed === 2) {
        resolve();
      }
    });
  });

  await Sentry.startSpan({ name: 'enqueue test-jobs' }, async () => {
    await queue.add('test-job-1', { data: 'test-data' });
    await queue.add('test-job-2', { data: 'test-data' });
  });

  await jobsProcessed;
  await worker.close();
  await queue.close();
  await Sentry.flush();
}

run();
