import { instrumentCron } from './cron';
import { instrumentNodeCron } from './node-cron';
import { instrumentNodeSchedule } from './node-schedule';

/** Methods to instrument cron libraries for Sentry check-ins */
export const cron = {
  instrumentCron,
  instrumentNodeCron,
  instrumentNodeSchedule,
};
