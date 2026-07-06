import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';

export const anthropicAiConfig = [
  // One entry each for CJS/ESM
  ...['resources/messages/messages.js', 'resources/messages/messages.mjs'].flatMap(filePath =>
    (['create', 'countTokens'] as const).map(methodName => ({
      channelName: 'chat',
      module: { name: '@anthropic-ai/sdk', versionRange: '>=0.19.2 <1', filePath },
      functionQuery: { className: 'Messages', methodName, kind: 'Auto' as const },
    })),
  ),
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
  ...['resources/models.js', 'resources/models.mjs'].map(filePath => ({
    channelName: 'models',
    module: { name: '@anthropic-ai/sdk', versionRange: '>=0.19.2 <1', filePath },
    functionQuery: { className: 'Models', methodName: 'retrieve', kind: 'Auto' as const },
  })),
  // `messages.stream()` returns a synchronous emitter, not a promise, so `kind: 'Sync'` is required:
  // `Auto`'s promise wrapper never publishes `end` for a non-thenable return, so the span would never end.
  ...['resources/messages/messages.js', 'resources/messages/messages.mjs'].map(filePath => ({
    channelName: 'messages-stream',
    module: { name: '@anthropic-ai/sdk', versionRange: '>=0.19.2 <1', filePath },
    functionQuery: { className: 'Messages', methodName: 'stream', kind: 'Sync' as const },
  })),
] satisfies InstrumentationConfig[];

export const anthropicAiChannels = {
  ANTHROPIC_CHAT: 'orchestrion:@anthropic-ai/sdk:chat',
  ANTHROPIC_MODELS: 'orchestrion:@anthropic-ai/sdk:models',
  ANTHROPIC_MESSAGES_STREAM: 'orchestrion:@anthropic-ai/sdk:messages-stream',
} as const;
