import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// `chat()` takes its middleware per call and `@tanstack/ai` has no global registry, so the only way
// in without user code is to rewrite the options of each call. `chat` is a plain function declaration
// in a stable, unhashed file (`dist/esm/activities/chat/index.js` in 1.0.0). It returns a stream or a
// promise depending on `stream`, so it is wrapped `Sync`: we only need the `start` event.
export const tanstackAiConfig = [
  {
    channelName: 'chat',
    module: { name: '@tanstack/ai', versionRange: '>=1.0.0 <2.0.0', filePath: 'dist/esm/activities/chat/index.js' },
    functionQuery: { functionName: 'chat', kind: 'Sync' },
  },
  // The other activities take observe-only middleware that never sees the input or the result, so we
  // trace the call itself.
  {
    channelName: 'embed',
    module: { name: '@tanstack/ai', versionRange: '>=1.0.0 <2.0.0', filePath: 'dist/esm/activities/embed/index.js' },
    functionQuery: { functionName: 'embed', kind: 'Async' },
  },
] satisfies InstrumentationConfig[];

export const tanstackAiModuleNames = getModuleNames(tanstackAiConfig);

export const tanstackAiChannels = {
  TANSTACK_AI_CHAT: 'orchestrion:@tanstack/ai:chat',
  TANSTACK_AI_EMBED: 'orchestrion:@tanstack/ai:embed',
} as const;
