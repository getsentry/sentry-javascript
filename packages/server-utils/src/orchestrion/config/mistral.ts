import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

// `@mistralai/mistralai` v2 is ESM-only, so there is a single built file per resource (no dual CJS/ESM
// variants). Each SDK resource class exposes async methods that return a thenable, so `kind: 'Auto'`
// resolves to `wrapPromise`; the `.stream` methods resolve to an async-iterable `EventStream`.
const MODULE = { name: '@mistralai/mistralai', versionRange: '>=2.0.0 <3' } as const;

export const mistralConfig = [
  {
    channelName: 'chat',
    module: { ...MODULE, filePath: 'esm/sdk/chat.js' },
    functionQuery: { className: 'Chat', methodName: 'complete', kind: 'Auto' as const },
  },
  {
    channelName: 'chat',
    module: { ...MODULE, filePath: 'esm/sdk/chat.js' },
    functionQuery: { className: 'Chat', methodName: 'stream', kind: 'Auto' as const },
  },
  {
    channelName: 'embeddings',
    module: { ...MODULE, filePath: 'esm/sdk/embeddings.js' },
    functionQuery: { className: 'Embeddings', methodName: 'create', kind: 'Auto' as const },
  },
  {
    channelName: 'agents',
    module: { ...MODULE, filePath: 'esm/sdk/agents.js' },
    functionQuery: { className: 'Agents', methodName: 'complete', kind: 'Auto' as const },
  },
  {
    channelName: 'agents',
    module: { ...MODULE, filePath: 'esm/sdk/agents.js' },
    functionQuery: { className: 'Agents', methodName: 'stream', kind: 'Auto' as const },
  },
] satisfies InstrumentationConfig[];

export const mistralModuleNames = getModuleNames(mistralConfig);

export const mistralChannels = {
  MISTRAL_CHAT: 'orchestrion:@mistralai/mistralai:chat',
  MISTRAL_EMBEDDINGS: 'orchestrion:@mistralai/mistralai:embeddings',
  MISTRAL_AGENTS: 'orchestrion:@mistralai/mistralai:agents',
} as const;
