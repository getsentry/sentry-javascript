import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { Queue, Worker } from 'bullmq';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

const connection = { host: 'localhost', port: 6385 };
const telemetry = new Sentry.BullMQTelemetry();
const instrumentBeforeRun = process.env.INSTRUMENT_BEFORE_RUN === 'true';

async function run() {
  const queue = new Queue('crons-telemetry', { connection, telemetry });
  await queue.obliterate({ force: true });

  await queue.upsertJobScheduler('ok-scheduler', { every: 300_000 }, { name: 'ok-job' });
  await queue.upsertJobScheduler(
    'failing-scheduler',
    { pattern: '0 0 9 * * 1-5', tz: 'Europe/Vienna', immediately: true },
    { name: 'failing-job' },
  );

  const worker = new Worker(
    'crons-telemetry',
    async job => {
      await Sentry.startSpan({ name: `work ${job.name}` }, async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });
      if (job.name === 'failing-job') {
        throw new Error('Error in scheduled job');
      }
    },
    { connection, telemetry, autorun: !instrumentBeforeRun },
  );
  Sentry.cron.instrumentBullMQWorker(worker);

  const finished = new Promise(resolve => {
    let count = 0;
    const done = () => {
      if (++count === 2) {
        resolve();
      }
    };
    worker.on('completed', done);
    worker.on('failed', done);
  });

  if (instrumentBeforeRun) {
    void worker.run();
  }

  await finished;
  await worker.close();
  await queue.obliterate({ force: true });
  await queue.close();
  await Sentry.flush();
  process.exit();
}

void run();
