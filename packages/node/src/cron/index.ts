import { instrumentNodeCron } from './node-cron';

/**
 * Methods to instrument cron libraries for Sentry check-ins.
 */
export const cron = {
  instrumentNodeCron,
};
