import * as Sentry from '@sentry/node';
import { CronJob } from 'cron';

Sentry.init({
  traceLifecycle: 'static',
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
});

const CronJobWithCheckIn = Sentry.cron.instrumentCron(CronJob, 'my-cron-job');

let closeNext = false;

const cron = new CronJobWithCheckIn('* * * * * *', () => {
  if (closeNext) {
    cron.stop();
    throw new Error('Error in cron job');
  }

  // eslint-disable-next-line no-console
  console.log('You will see this message every second');
  closeNext = true;
});

cron.start();

// `cron` sizes the delay to the next tick from two clock reads, clamps a negative result to -1 and
// then treats that -1 as "stop". A pause between those two reads that straddles a second boundary
// is enough to hit it, and the job is left scheduled for nothing: no ticks, no check-ins, and the
// scenario exits on the timeout below having sent nothing at all. Starting again re-reads the clock
// away from the boundary.
for (let attempt = 0; attempt < 5 && !cron.running; attempt++) {
  cron.start();
}

if (!cron.running) {
  throw new Error('`cron` refused to schedule the job');
}

setTimeout(() => {
  process.exit();
}, 15_000);
