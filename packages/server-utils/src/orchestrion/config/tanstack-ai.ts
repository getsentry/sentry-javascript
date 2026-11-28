import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// `chat()` takes its middleware per call, and `@tanstack/ai` has no global middleware registry, so
// the integration changes the options of each call. `chat` returns a stream or a promise, depending
// on `stream`, but it runs nothing before it returns, so `Sync` is enough: we only need `start`.
export const tanstackAiConfig = [
  {
    channelName: 'chat',
    module: { name: '@tanstack/ai', versionRange: '>=1.0.0 <2.0.0', filePath: 'dist/esm/activities/chat/index.js' },
    functionQuery: { functionName: 'chat', kind: 'Sync' },
  },
] satisfies InstrumentationConfig[];

export const tanstackAiModuleNames = getModuleNames(tanstackAiConfig);

export const tanstackAiChannels = {
  TANSTACK_AI_CHAT: 'orchestrion:@tanstack/ai:chat',
} as const;
