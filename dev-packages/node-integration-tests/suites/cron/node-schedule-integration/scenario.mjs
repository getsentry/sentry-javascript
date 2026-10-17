import schedule from 'node-schedule';

const excluded = schedule.scheduleJob('excluded-job', '0 0 * * *', () => {});
const unnamed = schedule.scheduleJob('0 0 * * *', () => {});
const recurrenceRule = schedule.scheduleJob('rule-job', { hour: 3, minute: 0 }, () => {});

let runs = 0;
const job = schedule.scheduleJob('my-schedule-job', { rule: '30 9 * * 1-5', tz: 'Europe/Vienna' }, () => {
  runs++;
  if (runs > 1) {
    throw new Error('Error in scheduled job');
  }
});

// Run the jobs without waiting for their schedule.
excluded.invoke();
unnamed.invoke();
recurrenceRule.invoke();
job.invoke();
try {
  job.invoke();
} catch {
  // node-schedule catches errors when it runs the job itself
}

setTimeout(() => process.exit(), 10_000);
