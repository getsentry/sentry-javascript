import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

export const nodeScheduleConfig = [
  {
    channelName: 'scheduleJob',
    module: { name: 'node-schedule', versionRange: '>=1.3.0 <3', filePath: 'lib/schedule.js' },
    functionQuery: { functionName: 'scheduleJob', kind: 'Sync' },
  },
] satisfies InstrumentationConfig[];

export const nodeScheduleModuleNames = getModuleNames(nodeScheduleConfig);

export const nodeScheduleChannels = {
  NODE_SCHEDULE_SCHEDULE_JOB: 'orchestrion:node-schedule:scheduleJob',
} as const;
