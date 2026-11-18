import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// oRPC v2 builds one unbundled ESM file per source file. `executeProcedureInternal` is not public API, so a
// rename in oRPC silently drops both the procedure spans and the error capture.
// `-0` makes the range include the v2 prereleases (`2.0.0-beta.*`).
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
