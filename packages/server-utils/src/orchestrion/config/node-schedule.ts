import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// `Job` sets `reschedule` on each instance in its constructor. It moved from `lib/schedule.js` to `lib/Job.js` in 2.0.0.
const reschedule = {
  channelName: 'reschedule',
  astQuery: "AssignmentExpression[left.property.name='reschedule'] > FunctionExpression",
  functionQuery: { kind: 'Sync' },
} as const;

export const nodeScheduleConfig = [
  {
    channelName: 'scheduleJob',
    module: { name: 'node-schedule', versionRange: '>=1.3.0 <3', filePath: 'lib/schedule.js' },
    functionQuery: { functionName: 'scheduleJob', kind: 'Sync' },
  },
  {
    ...reschedule,
    module: { name: 'node-schedule', versionRange: '>=1.3.0 <2', filePath: 'lib/schedule.js' },
  },
  {
    ...reschedule,
    module: { name: 'node-schedule', versionRange: '>=2.0.0 <3', filePath: 'lib/Job.js' },
  },
] satisfies InstrumentationConfig[];

export const nodeScheduleModuleNames = getModuleNames(nodeScheduleConfig);

export const nodeScheduleChannels = {
  NODE_SCHEDULE_SCHEDULE_JOB: 'orchestrion:node-schedule:scheduleJob',
  NODE_SCHEDULE_RESCHEDULE: 'orchestrion:node-schedule:reschedule',
} as const;
