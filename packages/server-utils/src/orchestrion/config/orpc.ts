import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

export const orpcConfig = [
  {
    channelName: 'executeProcedure',
    module: { name: '@orpc/server', versionRange: '>=2.0.0-0 <3', filePath: 'dist/procedure-client.js' },
    functionQuery: { functionName: 'executeProcedureInternal', kind: 'Async' },
  },
] satisfies InstrumentationConfig[];

export const orpcModuleNames = getModuleNames(orpcConfig);

export const orpcChannels = {
  ORPC_EXECUTE_PROCEDURE: 'orchestrion:@orpc/server:executeProcedure',
} as const;
