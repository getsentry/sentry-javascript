import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

export const koaConfig = [
  {
    channelName: 'use',
    module: { name: 'koa', versionRange: '>=2.0.0 <4', filePath: 'lib/application.js' },
    functionQuery: { className: 'Application', methodName: 'use', kind: 'Sync' },
  },
] satisfies InstrumentationConfig[];

export const koaModuleNames = getModuleNames(koaConfig);

export const koaChannels = {
  KOA_USE: 'orchestrion:koa:use',
} as const;
