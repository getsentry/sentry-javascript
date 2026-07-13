import './instrument.mjs';

import * as Sentry from '@sentry/node';
import { Queue, Worker } from 'bullmq';
import express from 'express';

const app = express();
const port = 3030;

const connection = { host: '127.0.0.1', port: 6379 };
const telemetry = new Sentry.BullMQTelemetry();

const testQueue = new Queue('test-queue', { connection, telemetry });

const worker = new Worker(
  'test-queue',
  async job => {
    if (job.name === 'fail-job') {
      throw new Error('Test error from BullMQ processor');
    }

    if (job.name === 'breadcrumb-job') {
      Sentry.addBreadcrumb({ message: 'breadcrumb-from-bullmq-processor' });
    }

    return { success: true };
  },
  { connection, telemetry },
);

worker.on('error', err => {
  console.error('Worker error:', err);
});

app.get('/enqueue/success', async (req, res) => {
  await testQueue.add('success-job', { data: 'test' });
  res.send('Job enqueued');
});

app.get('/enqueue/fail', async (req, res) => {
  await testQueue.add('fail-job', { data: 'test' });
  res.send('Job enqueued');
});

app.get('/enqueue/breadcrumb-test', async (req, res) => {
  await testQueue.add('breadcrumb-job', { data: 'test' });
  res.send('Job enqueued');
});

app.get('/check-isolation', async (req, res) => {
  res.send('Isolation check');
});

Sentry.setupExpressErrorHandler(app);

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
