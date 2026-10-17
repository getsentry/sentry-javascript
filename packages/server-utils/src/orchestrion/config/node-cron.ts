import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// `schedule()` calls `createTask(expression, func, options)`, so wrapping `createTask` covers both.
export const nodeCronConfig = [
  {
    channelName: 'createTask',
    module: { name: 'node-cron', versionRange: '>=4.0.0 <5', filePath: 'dist/node-cron.cjs' },
    functionQuery: { functionName: 'createTask', kind: 'Sync' },
  },
  {
    channelName: 'createTask',
    module: { name: 'node-cron', versionRange: '>=4.0.0 <5', filePath: 'dist/node-cron.js' },
    functionQuery: { functionName: 'createTask', kind: 'Sync' },
  },
  {
    channelName: 'createTask',
    module: { name: 'node-cron', versionRange: '>=3.0.0 <4', filePath: 'src/node-cron.js' },
    functionQuery: { functionName: 'createTask', kind: 'Sync' },
  },
] satisfies InstrumentationConfig[];

export const nodeCronModuleNames = getModuleNames(nodeCronConfig);

export const nodeCronChannels = {
  NODE_CRON_CREATE_TASK: 'orchestrion:node-cron:createTask',
} as const;
