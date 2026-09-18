import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

export const anthropicAiConfig = [
  // One entry each for CJS/ESM
  ...['resources/messages/messages.js', 'resources/messages/messages.mjs'].map(filePath => ({
    channelName: 'chat',
    module: { name: '@anthropic-ai/sdk', versionRange: '>=0.19.2 <1', filePath },
    functionQuery: { className: 'Messages', methodName: 'create', kind: 'Auto' as const },
  })),
  ...['resources/completions.js', 'resources/completions.mjs'].map(filePath => ({
    channelName: 'chat',
    module: { name: '@anthropic-ai/sdk', versionRange: '>=0.19.2 <1', filePath },
    functionQuery: { className: 'Completions', methodName: 'create', kind: 'Auto' as const },
  })),
  ...['resources/beta/messages/messages.js', 'resources/beta/messages/messages.mjs'].map(filePath => ({
    channelName: 'chat',
    module: { name: '@anthropic-ai/sdk', versionRange: '>=0.19.2 <1', filePath },
    functionQuery: { className: 'Messages', methodName: 'create', kind: 'Auto' as const },
  })),
  // `messages.stream()` returns a synchronous emitter, not a promise, so `kind: 'Sync'` is required:
  // `Auto`'s promise wrapper never publishes `end` for a non-thenable return, so the span would never end.
  ...['resources/messages/messages.js', 'resources/messages/messages.mjs'].map(filePath => ({
    channelName: 'messages-stream',
    module: { name: '@anthropic-ai/sdk', versionRange: '>=0.19.2 <1', filePath },
    functionQuery: { className: 'Messages', methodName: 'stream', kind: 'Sync' as const },
  })),
  // `Stream.fromSSEResponse` is the one place the SDK's `Stream` and the raw `Response` meet. Hooking
  // it lets the span survive the consumption paths the `Stream`'s async iterator never sees — chiefly
  // `.asResponse()`/`.withResponse()`, where the caller drains `response.body` itself.
  {
    channelName: 'sse-stream',
    module: {
      name: '@anthropic-ai/sdk',
      versionRange: '>=0.19.2 <1',
      // `class Stream` sits at the package root up to 0.5x and under `core/` from 0.59 on, where the
      // root file is left behind as a re-export shim that matches nothing.
      filePath: /^(?:core\/)?streaming\.(?:js|mjs)$/,
    },
    functionQuery: { className: 'Stream', methodName: 'fromSSEResponse', kind: 'Sync' as const },
  },
] satisfies InstrumentationConfig[];

export const anthropicAiModuleNames = getModuleNames(anthropicAiConfig);

export const anthropicAiChannels = {
  ANTHROPIC_CHAT: 'orchestrion:@anthropic-ai/sdk:chat',
  ANTHROPIC_MESSAGES_STREAM: 'orchestrion:@anthropic-ai/sdk:messages-stream',
  ANTHROPIC_SSE_STREAM: 'orchestrion:@anthropic-ai/sdk:sse-stream',
} as const;
