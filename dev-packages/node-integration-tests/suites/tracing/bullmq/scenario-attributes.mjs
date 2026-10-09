import * as Sentry from '@sentry/node';
import { FlowProducer, Queue, Worker } from 'bullmq';

const telemetry = new Sentry.BullMQTelemetry({ enableMetrics: true });
const connection = { host: '127.0.0.1', port: 6384 };

async function run() {
  const opsQueue = new Queue('attributes-ops-queue', { connection, telemetry });
  const opsWorker = new Worker('attributes-ops-queue', null, { connection, telemetry, name: 'attributes-ops-worker' });
  const flowProducer = new FlowProducer({ connection, telemetry });
  const processQueue = new Queue('attributes-process-queue', { connection, telemetry });
  const processWorker = new Worker('attributes-process-queue', async () => {}, {
    connection,
    telemetry,
    name: 'attributes-worker',
  });

  const jobProcessed = new Promise(resolve => {
    processWorker.once('completed', () => resolve());
  });

  await Sentry.startSpan({ name: 'bullmq attributes' }, async () => {
    await processQueue.add('process-job', { data: 'test-data' });

    await opsQueue.addBulk([
      { name: 'bulk-job-1', data: {} },
      { name: 'bulk-job-2', data: {} },
    ]);
    await flowProducer.add({
      name: 'flow-root',
      queueName: 'attributes-ops-queue',
      children: [{ name: 'flow-child', queueName: 'attributes-ops-queue' }],
    });
    await opsQueue.upsertJobScheduler('attributes-scheduler', { every: 60_000 }, { name: 'scheduled-job' });

    const progressJob = await opsQueue.add('progress-job', {});
    await opsQueue.updateJobProgress(progressJob.id, { percentage: 50 });
    await opsQueue.remove(progressJob.id, { removeChildren: true });
    await opsQueue.removeDeduplicationKey('attributes-deduplication-id');
    await opsQueue.removeDebounceKey('attributes-debounce-id');
    await opsQueue.retryJobs({ count: 10 });
    await opsQueue.promoteJobs({ count: 10 });
    await opsQueue.trimEvents(100);
    await opsQueue.clean(0, 100, 'completed');

    await opsWorker.getNextJob('attributes-token', { block: false });
    // BullMQ runs these two on timers. Calling them directly runs them once, inside this span.
    await opsWorker['moveStalledJobsToWait']();
    await opsWorker['lockManager'].extendLocks([]);
    await opsWorker.rateLimit(1);
    await opsWorker.pause(true);
    await opsWorker.close(true);

    await opsQueue.rateLimit(1);
    await opsQueue.drain(true);
  });

  await jobProcessed;
  await processQueue.recordJobCountsMetric('waiting', 'completed');
  await processWorker.close();

  await opsQueue.obliterate({ force: true });
  await processQueue.obliterate({ force: true });
  await Promise.all([flowProducer.close(), opsQueue.close(), processQueue.close()]);
  await Sentry.flush();
}

run();
