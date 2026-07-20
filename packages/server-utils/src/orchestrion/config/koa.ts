import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';
import { getModuleNames } from './utils';

export const koaConfig = [
  {
    channelName: 'use',
    module: { name: 'koa', versionRange: '>=2.0.0 <4', filePath: 'lib/application.js' },
    functionQuery: { className: 'Application', methodName: 'use', kind: 'Sync' },
  },
] as const satisfies InstrumentationConfig[];

export const koaModuleNames = getModuleNames(koaConfig);

export const koaChannels = {
  KOA_USE: 'orchestrion:koa:use',
} as const;
