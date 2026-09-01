import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

// `class Mastra` lives only in tsdown's content-hashed chunk (`dist/mastra-RpLTNzL-.js` in 1.63.2).
// The stable files (`dist/index.js`, `dist/mastra/index.js`) are one-line re-exports, so an exact
// `filePath` cannot wrap the constructor. `registerExporter()` exists since 1.63.2.
const mastraConstructorConfig: InstrumentationConfig[] = [
  {
    channelName: 'mastraConstructor',
    module: {
      name: '@mastra/core',
      versionRange: '>=1.63.2 <2.0.0',
      filePath: /^dist\/mastra-[A-Za-z0-9_-]+\.(cjs|mjs|js)$/,
    },
    // No `methodName` → class constructor. The `end` message's `self` is the instance.
    functionQuery: { className: 'Mastra' },
  },
];

export const mastraConfig = mastraConstructorConfig satisfies InstrumentationConfig[];

export const mastraModuleNames = getModuleNames(mastraConfig);

export const mastraChannels = {
  MASTRA_CONSTRUCTOR: 'orchestrion:@mastra/core:mastraConstructor',
} as const;
