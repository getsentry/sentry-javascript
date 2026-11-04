import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

const createTask = { functionName: 'createTask', kind: 'Sync' } as const;

// `schedule()` calls `createTask(expression, func, options)`, so wrapping `createTask` covers both.
// Before 4.6, node-cron reads weekday ranges like `sat-sun` differently, so those versions get their own channel.
export const nodeCronConfig = [
  {
    channelName: 'createTask',
    module: { name: 'node-cron', versionRange: '>=4.6.0 <5', filePath: 'dist/node-cron.cjs' },
    functionQuery: createTask,
  },
  {
    channelName: 'createTask',
    module: { name: 'node-cron', versionRange: '>=4.6.0 <5', filePath: 'dist/node-cron.js' },
    functionQuery: createTask,
  },
  {
    channelName: 'v4_createTask',
    module: { name: 'node-cron', versionRange: '>=4.3.0 <4.6.0', filePath: 'dist/node-cron.cjs' },
    functionQuery: createTask,
  },
  {
    channelName: 'v4_createTask',
    module: { name: 'node-cron', versionRange: '>=4.0.0 <4.6.0', filePath: 'dist/node-cron.js' },
    functionQuery: createTask,
  },
  {
    channelName: 'v4_createTask',
    module: { name: 'node-cron', versionRange: '>=4.0.0 <4.3.0', filePath: 'dist/cjs/node-cron.js' },
    functionQuery: createTask,
  },
  {
    channelName: 'v4_createTask',
    module: { name: 'node-cron', versionRange: '>=4.0.0 <4.3.0', filePath: 'dist/esm/node-cron.js' },
    functionQuery: createTask,
  },
  {
    channelName: 'v3_createTask',
    module: { name: 'node-cron', versionRange: '>=3.0.0 <4', filePath: 'src/node-cron.js' },
    functionQuery: createTask,
  },
] satisfies InstrumentationConfig[];

export const nodeCronModuleNames = getModuleNames(nodeCronConfig);

export const nodeCronChannels = {
  NODE_CRON_CREATE_TASK: 'orchestrion:node-cron:createTask',
  NODE_CRON_V4_CREATE_TASK: 'orchestrion:node-cron:v4_createTask',
  NODE_CRON_V3_CREATE_TASK: 'orchestrion:node-cron:v3_createTask',
} as const;
