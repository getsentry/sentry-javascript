import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

const module = { name: '@earendil-works/pi-ai', versionRange: '>=0.80.0 <2.0.0' };

type Kind = 'Sync' | 'Async';

const modelsMethod = (methodName: string, channelName: string, kind: Kind): InstrumentationConfig => ({
  channelName,
  module: { ...module, filePath: 'dist/models.js' },
  functionQuery: { className: 'ModelsImpl', methodName, kind },
});

const compatFunction = (functionName: string, channelName: string, kind: Kind): InstrumentationConfig => ({
  channelName,
  module: { ...module, filePath: 'dist/compat.js' },
  functionQuery: { functionName, kind },
});

// `ModelsImpl` is what `createModels()` returns, and what Flue and pi-durable send their requests
// through; the `compat` functions are the standalone API. The `complete` functions only await the
// stream of their `stream` counterpart, and the integration leaves out that nested call, so the
// span of a request still tells whether its caller streamed it.
export const piAiConfig = [
  modelsMethod('stream', 'stream', 'Sync'),
  modelsMethod('streamSimple', 'stream', 'Sync'),
  compatFunction('stream', 'stream', 'Sync'),
  compatFunction('streamSimple', 'stream', 'Sync'),
  modelsMethod('complete', 'complete', 'Async'),
  modelsMethod('completeSimple', 'complete', 'Async'),
  compatFunction('complete', 'complete', 'Async'),
  compatFunction('completeSimple', 'complete', 'Async'),
  // These fetch the answer of a parked request: their second argument is a handle, not the request.
  modelsMethod('streamDeferred', 'streamDeferred', 'Sync'),
  modelsMethod('fetchDeferred', 'fetchDeferred', 'Async'),
] satisfies InstrumentationConfig[];

export const piAiModuleNames = getModuleNames(piAiConfig);

export const piAiChannels = {
  PI_AI_STREAM: 'orchestrion:@earendil-works/pi-ai:stream',
  PI_AI_COMPLETE: 'orchestrion:@earendil-works/pi-ai:complete',
  PI_AI_STREAM_DEFERRED: 'orchestrion:@earendil-works/pi-ai:streamDeferred',
  PI_AI_FETCH_DEFERRED: 'orchestrion:@earendil-works/pi-ai:fetchDeferred',
} as const;
