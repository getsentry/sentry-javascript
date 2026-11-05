import schedule from 'node-schedule';

const excluded = schedule.scheduleJob('excluded-job', '0 0 * * *', () => {});
const unnamed = schedule.scheduleJob('0 0 * * *', () => {});
const oneOff = schedule.scheduleJob('one-off-job', Date.now() + 86_400_000, () => {});
const recurrenceRule = schedule.scheduleJob('rule-job', { hour: 3, minute: 0 }, () => {});
const ending = schedule.scheduleJob('ending-job', { rule: '0 0 * * *', end: Date.now() + 86_400_000 }, () => {});
const newJob = new schedule.Job('new-job', () => {});
newJob.schedule({ rule: '0 0 * * *', tz: 'UTC' });

let runs = 0;
const job = schedule.scheduleJob('my-schedule-job', { rule: '30 9 * * 1-5', tz: 'Europe/Vienna' }, () => {
  runs++;
  if (runs === 2) {
    throw new Error('Error in scheduled job');
  }
});

// Run the jobs without waiting for their schedule.
excluded.invoke();
unnamed.invoke();
oneOff.invoke();
recurrenceRule.invoke();
ending.invoke();
newJob.invoke();
job.invoke();
try {
  job.invoke();
} catch {
  // node-schedule catches errors when it runs the job itself
}
schedule.rescheduleJob(job, { rule: '0 8 * * *', tz: 'UTC' });
job.invoke();

setTimeout(() => process.exit(), 10_000);
