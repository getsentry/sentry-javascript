import type { InstrumentationConfig } from '..';
import { uniq } from '@sentry/core';

export const lruMemoizerConfig = [
  {
    channelName: 'load',
    // `>=2.1.0` only: the named `function memoizedFunction()` the selector targets exists from 2.1.0
    module: { name: 'lru-memoizer', versionRange: '>=2.1.0 <4', filePath: 'lib/async.js' },
    functionQuery: { functionName: 'memoizedFunction', kind: 'Callback' },
  },
] as const satisfies InstrumentationConfig[];

export const lruMemoizerModuleNames = uniq(lruMemoizerConfig.map(config => config.module.name));

export const lruMemoizerChannels = {
  LRU_MEMOIZER_LOAD: 'orchestrion:lru-memoizer:load',
} as const;
