import type { InstrumentationConfig } from '..';
import { getModuleNames, toSubscribeInjections } from './subscribe-injection';

export const lruMemoizerConfig = [
  {
    channelName: 'load',
    // `>=2.1.0` only: the named `function memoizedFunction()` the selector targets exists from 2.1.0
    module: { name: 'lru-memoizer', versionRange: '>=2.1.0 <4', filePath: 'lib/async.js' },
    functionQuery: { functionName: 'memoizedFunction', kind: 'Callback' },
  },
] satisfies InstrumentationConfig[];

export const lruMemoizerModuleNames = getModuleNames(lruMemoizerConfig);

export const lruMemoizerChannels = {
  LRU_MEMOIZER_LOAD: 'orchestrion:lru-memoizer:load',
} as const;

export const lruMemoizerSubscribeInjection = toSubscribeInjections(lruMemoizerConfig);
