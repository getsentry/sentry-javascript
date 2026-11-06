import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// `runCron(compiledSharedOptions, parsedCronItems, requirements)` starts the crontab scheduler of a
// runner. It is a `const` arrow in both the CJS (<0.18) and ESM (0.18) builds.
export const graphileWorkerConfig = [
  {
    channelName: 'runCron',
    module: { name: 'graphile-worker', versionRange: '>=0.16.0 <0.19', filePath: 'dist/cron.js' },
    functionQuery: { expressionName: 'runCron', kind: 'Sync' },
  },
] satisfies InstrumentationConfig[];

export const graphileWorkerModuleNames = getModuleNames(graphileWorkerConfig);

export const graphileWorkerChannels = {
  GRAPHILE_WORKER_RUN_CRON: 'orchestrion:graphile-worker:runCron',
} as const;
