import type { InstrumentationConfig } from '..';
import { getModuleNames } from './utils';

// `dataloader` ships a single transpiled CommonJS `index.js`. Its class methods are emitted as
// `_proto.<name> = function <name>() {}` (named function *expressions*), so they match on
// `expressionName` rather than `methodName`. The constructor is a named function declaration.
// The version range mirrors `supportedVersions` in the vendored OTel instrumentation.
const module = { name: 'dataloader', versionRange: '>=2.0.0 <3', filePath: 'index.js' } as const;

export const dataloaderConfig = [
  // Wrap the constructor so the subscriber can wrap the user's `batchLoadFn` (arg 0). The batch span
  // is opened when that wrapped function actually runs (on the deferred dispatch tick), mirroring the
  // vendored OTel instrumentation which also wraps `batchLoadFn` at construction time.
  {
    channelName: 'construct',
    module,
    functionQuery: { functionName: 'DataLoader', kind: 'Sync' },
  },
  // `load`/`loadMany` return Promises, so they're `Async`: the span ends on `asyncEnd` (when the
  // load resolves), capturing the real latency and enclosing the deferred `batch` span — matching the
  // vendored OTel `startSpan`. `prime`/`clear`/`clearAll` return `this` synchronously, so they stay `Sync`.
  {
    channelName: 'load',
    module,
    functionQuery: { expressionName: 'load', kind: 'Async' },
  },
  {
    channelName: 'loadMany',
    module,
    functionQuery: { expressionName: 'loadMany', kind: 'Async' },
  },
  {
    channelName: 'prime',
    module,
    functionQuery: { expressionName: 'prime', kind: 'Sync' },
  },
  {
    channelName: 'clear',
    module,
    functionQuery: { expressionName: 'clear', kind: 'Sync' },
  },
  {
    channelName: 'clearAll',
    module,
    functionQuery: { expressionName: 'clearAll', kind: 'Sync' },
  },
] as const satisfies InstrumentationConfig[];

export const dataloaderModuleNames = getModuleNames(dataloaderConfig);

export const dataloaderChannels = {
  DATALOADER_CONSTRUCT: 'orchestrion:dataloader:construct',
  DATALOADER_LOAD: 'orchestrion:dataloader:load',
  DATALOADER_LOAD_MANY: 'orchestrion:dataloader:loadMany',
  DATALOADER_PRIME: 'orchestrion:dataloader:prime',
  DATALOADER_CLEAR: 'orchestrion:dataloader:clear',
  DATALOADER_CLEAR_ALL: 'orchestrion:dataloader:clearAll',
} as const;
