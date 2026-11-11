import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { Queue, Worker } from 'bullmq';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

const connection = { host: 'localhost', port: 6385 };

async function run(): Promise<void> {
  const queue = new Queue('crons', { connection });
  await queue.obliterate({ force: true });

  const worker = new Worker(
    'crons',
    async job => {
      if (job.name === 'failing' || (job.name === 'flaky' && job.attemptsMade === 0)) {
        throw new Error('Error in scheduled job');
      }
    },
    { connection },
  );
  Sentry.cron.instrumentBullMQWorker(worker);

  await queue.add('plain', {});
  await queue.upsertJobScheduler('every-scheduler', { every: 300_000 }, { name: 'every' });
  await queue.upsertJobScheduler(
    'pattern-scheduler',
    { pattern: '0 0 9 * * 1-5', tz: 'Europe/Vienna', immediately: true },
    { name: 'failing' },
  );
  await queue.upsertJobScheduler('retry-scheduler', { every: 600_000 }, { name: 'flaky', opts: { attempts: 2 } });

  setTimeout(async () => {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    process.exit();
  }, 5_000);
}

void run();
