import { CronJob } from 'cron';

const excluded = CronJob.from({ cronTime: '0 0 * * *', onTick: () => {}, name: 'excluded-job' });
const unnamed = new CronJob('0 0 * * *', () => {});

let runs = 0;
const job = CronJob.from({
  cronTime: '0 30 9 * * 1-5',
  timeZone: 'Europe/Vienna',
  name: 'my-cron-job',
  waitForCompletion: true,
  errorHandler: () => {},
  onTick: async () => {
    runs++;
    if (runs > 1) {
      throw new Error('Error in cron job');
    }
  },
});

// Run the jobs without waiting for their schedule.
(async () => {
  await excluded.fireOnTick();
  await unnamed.fireOnTick();
  await job.fireOnTick();
  await job.fireOnTick();
})();

setTimeout(() => process.exit(), 10_000);
