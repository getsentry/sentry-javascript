import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

export const anthropicAiConfig = [
  // One entry each for CJS/ESM
  ...['resources/messages/messages.js', 'resources/messages/messages.mjs'].map(filePath => ({
    channelName: 'chat',
    module: { name: '@anthropic-ai/sdk', versionRange: '>=0.19.2 <1', filePath },
    functionQuery: { className: 'Messages', methodName: 'create', kind: 'Sync' as const },
  })),
  ...['resources/completions.js', 'resources/completions.mjs'].map(filePath => ({
    channelName: 'chat',
    module: { name: '@anthropic-ai/sdk', versionRange: '>=0.19.2 <1', filePath },
    functionQuery: { className: 'Completions', methodName: 'create', kind: 'Sync' as const },
  })),
  ...['resources/beta/messages/messages.js', 'resources/beta/messages/messages.mjs'].map(filePath => ({
    channelName: 'chat',
    module: { name: '@anthropic-ai/sdk', versionRange: '>=0.19.2 <1', filePath },
    functionQuery: { className: 'Messages', methodName: 'create', kind: 'Sync' as const },
  })),
  // `messages.stream()` returns a synchronous emitter, not a promise, so `kind: 'Sync'` is required:
  // `Auto`'s promise wrapper never publishes `end` for a non-thenable return, so the span would never end.
  ...['resources/messages/messages.js', 'resources/messages/messages.mjs'].map(filePath => ({
    channelName: 'messages-stream',
    module: { name: '@anthropic-ai/sdk', versionRange: '>=0.19.2 <1', filePath },
    functionQuery: { className: 'Messages', methodName: 'stream', kind: 'Sync' as const },
  })),
  ...['resources/beta/messages/messages.js', 'resources/beta/messages/messages.mjs'].map(filePath => ({
    channelName: 'tool-runner',
    module: { name: '@anthropic-ai/sdk', versionRange: '>=0.63.0 <1', filePath },
    functionQuery: { className: 'Messages', methodName: 'toolRunner', kind: 'Sync' as const },
  })),
  // The constructor, not `sessions.events.toolRunner()`, so runners built directly (e.g. by `EnvironmentWorker`) are covered.
  ...['lib/tools/SessionToolRunner.js', 'lib/tools/SessionToolRunner.mjs'].map(filePath => ({
    channelName: 'session-tool-runner',
    module: { name: '@anthropic-ai/sdk', versionRange: '>=0.97.0 <1', filePath },
    functionQuery: { className: 'SessionToolRunner' },
  })),
] satisfies InstrumentationConfig[];

export const anthropicAiModuleNames = getModuleNames(anthropicAiConfig);

export const anthropicAiChannels = {
  ANTHROPIC_CHAT: 'orchestrion:@anthropic-ai/sdk:chat',
  ANTHROPIC_MESSAGES_STREAM: 'orchestrion:@anthropic-ai/sdk:messages-stream',
  ANTHROPIC_TOOL_RUNNER: 'orchestrion:@anthropic-ai/sdk:tool-runner',
  ANTHROPIC_SESSION_TOOL_RUNNER: 'orchestrion:@anthropic-ai/sdk:session-tool-runner',
} as const;
