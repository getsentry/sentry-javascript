import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';
import { toSubscribeInjections } from './subscribe-injection';

export const koaConfig = [
  {
    channelName: 'use',
    module: { name: 'koa', versionRange: '>=2.0.0 <4', filePath: 'lib/application.js' },
    functionQuery: { className: 'Application', methodName: 'use', kind: 'Sync' },
  },
] satisfies InstrumentationConfig[];

export const koaChannels = {
  KOA_USE: 'orchestrion:koa:use',
} as const;

export const koaSubscribeInjection = toSubscribeInjections(koaConfig);
