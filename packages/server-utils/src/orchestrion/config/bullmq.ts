import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// Job schedulers were added in 5.16.0. The cron converter follows cron-parser 4, which BullMQ 5 uses, and BullMQ 6
// uses cron-parser 5.
const module = { name: 'bullmq', versionRange: '>=5.16.0 <6' } as const;

export const bullmqConfig = ['dist/cjs/classes/worker.js', 'dist/esm/classes/worker.js'].map(
  (filePath): InstrumentationConfig => ({
    channelName: 'workerConstructor',
    module: { ...module, filePath },
    functionQuery: { className: 'Worker' },
  }),
);

export const bullmqModuleNames = getModuleNames(bullmqConfig);

export const bullmqChannels = {
  BULLMQ_WORKER_CONSTRUCTOR: 'orchestrion:bullmq:workerConstructor',
} as const;
