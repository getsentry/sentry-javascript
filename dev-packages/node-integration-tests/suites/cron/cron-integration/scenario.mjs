import { CronJob, CronTime } from 'cron';

const excluded = CronJob.from({ cronTime: '0 0 * * *', onTick: () => {}, name: 'excluded-job' });
const unnamed = new CronJob('0 0 * * *', () => {});
const oneOff = CronJob.from({ cronTime: new Date(Date.now() + 86_400_000), onTick: () => {}, name: 'one-off-job' });
const offset = CronJob.from({ cronTime: '0 0 * * *', utcOffset: 60, onTick: () => {}, name: 'offset-job' });
const subMinute = CronJob.from({ cronTime: '*/10 * * * * *', onTick: () => {}, name: 'sub-minute-job' });

let runs = 0;
const job = CronJob.from({
  cronTime: '0 30 9 * * 1-5',
  timeZone: 'Europe/Vienna',
  name: 'my-cron-job',
  waitForCompletion: true,
  errorHandler: () => {},
  onTick: async () => {
    runs++;
    if (runs === 2) {
      throw new Error('Error in cron job');
    }
  },
});

// Run the jobs without waiting for their schedule.
(async () => {
  await excluded.fireOnTick();
  await unnamed.fireOnTick();
  await oneOff.fireOnTick();
  await offset.fireOnTick();
  await subMinute.fireOnTick();
  await job.fireOnTick();
  await job.fireOnTick();
  job.setTime(new CronTime('0 8 * * *', 'UTC'));
  await job.fireOnTick();
})();

setTimeout(() => process.exit(), 10_000);
