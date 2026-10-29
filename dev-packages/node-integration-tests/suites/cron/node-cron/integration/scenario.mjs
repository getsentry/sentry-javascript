import cron from 'node-cron';

const excluded = cron.schedule('0 0 0 1 1 *', () => {}, { name: 'excluded-job' });
const unnamed = cron.schedule('0 0 0 1 1 *', () => {});

let runs = 0;
const task = cron.schedule(
  '0 0 0 1 1 *',
  () => {
    runs++;
    if (runs > 1) {
      throw new Error('Error in cron job');
    }
  },
  { name: 'my-cron-job', timezone: 'America/New_York' },
);

// Run the tasks by hand. Their schedules can't fire during the test.
excluded
  .execute()
  .then(() => unnamed.execute())
  .then(() => task.execute())
  .then(() => task.execute());

setTimeout(() => process.exit(), 10_000);
