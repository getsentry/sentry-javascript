import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// `scheduleJob`, `rescheduleJob` and `job.reschedule` all call `job.schedule(spec)`. `Job` moved from
// `lib/schedule.js` to `lib/Job.js` in 2.0.0.
const schedule = {
  channelName: 'schedule',
  astQuery:
    "AssignmentExpression[left.object.property.name='prototype'][left.property.name='schedule'] > FunctionExpression",
  // `methodName` gives subscribers `self` before the call, not just after. `astQuery` still picks the function.
  functionQuery: { methodName: 'schedule', kind: 'Sync' },
} as const;

export const nodeScheduleConfig = [
  {
    ...schedule,
    module: { name: 'node-schedule', versionRange: '>=1.3.0 <2', filePath: 'lib/schedule.js' },
  },
  {
    ...schedule,
    module: { name: 'node-schedule', versionRange: '>=2.0.0 <3', filePath: 'lib/Job.js' },
  },
] satisfies InstrumentationConfig[];

export const nodeScheduleModuleNames = getModuleNames(nodeScheduleConfig);

export const nodeScheduleChannels = {
  NODE_SCHEDULE_SCHEDULE: 'orchestrion:node-schedule:schedule',
} as const;
