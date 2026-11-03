import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// `CronJob.from()` calls the constructor. Job names were added in 4.3.0.
export const cronConfig = [
  {
    channelName: 'cronJobConstructor',
    module: { name: 'cron', versionRange: '>=4.3.0 <5', filePath: 'dist/job.js' },
    functionQuery: { className: 'CronJob' },
  },
  {
    channelName: 'cronJobSetTime',
    module: { name: 'cron', versionRange: '>=4.3.0 <5', filePath: 'dist/job.js' },
    functionQuery: { className: 'CronJob', methodName: 'setTime', kind: 'Sync' },
  },
] satisfies InstrumentationConfig[];

export const cronModuleNames = getModuleNames(cronConfig);

export const cronChannels = {
  CRON_JOB_CONSTRUCTOR: 'orchestrion:cron:cronJobConstructor',
  CRON_JOB_SET_TIME: 'orchestrion:cron:cronJobSetTime',
} as const;
