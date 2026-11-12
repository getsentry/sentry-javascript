import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// Job schedulers were added in 5.16.0. BullMQ 6 gets its own channel, since it reads `pattern` with cron-parser 5.
const workerConfigs = (channelName: string, versionRange: string): InstrumentationConfig[] =>
  ['dist/cjs/classes/worker.js', 'dist/esm/classes/worker.js'].map(filePath => ({
    channelName,
    module: { name: 'bullmq', versionRange, filePath },
    functionQuery: { className: 'Worker' },
  }));

export const bullmqConfig = [
  ...workerConfigs('workerConstructor', '>=5.16.0 <6'),
  ...workerConfigs('worker6Constructor', '>=6.0.0 <7'),
];

export const bullmqModuleNames = getModuleNames(bullmqConfig);

export const bullmqChannels = {
  BULLMQ_WORKER_CONSTRUCTOR: 'orchestrion:bullmq:workerConstructor',
  BULLMQ_6_WORKER_CONSTRUCTOR: 'orchestrion:bullmq:worker6Constructor',
} as const;
