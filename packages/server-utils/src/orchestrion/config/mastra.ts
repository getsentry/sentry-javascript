import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

// `class Mastra` lives only in tsdown's content-hashed chunk (`dist/mastra-RpLTNzL-.js` and
// `dist/mastra-Dzmadbjh.cjs` in 1.63.2). The stable files (`dist/index.js`, `dist/mastra/index.js`)
// are one-line re-exports, so an exact `filePath` cannot wrap the constructor.
// The pattern therefore matches any `mastra*` chunk, in `dist/` or one level below, so a rename or
// relocation within the supported range does not silently stop the instrumentation. `className`
// remains the real selector, and `attachExporter` rejects anything without `registerExporter`.
// `registerExporter()` exists since 1.63.2.
const mastraConstructorConfig: InstrumentationConfig[] = [
  {
    channelName: 'mastraConstructor',
    module: {
      name: '@mastra/core',
      versionRange: '>=1.63.2 <2.0.0',
      filePath: /^dist\/(?:[\w.-]+\/)?mastra[\w.-]*\.(?:cjs|mjs|js)$/,
    },
    // No `methodName` → class constructor. The `end` message's `self` is the instance.
    functionQuery: { className: 'Mastra' },
  },
];

// Mastra runs each operation's work inside `executeWithContext({ span, fn })` /
// `executeWithContextSync` (its own async-context helper: `spanContextStorage.run(span, fn)`), passing
// the operation's AISpan. Wrapping these lets us make the *exporter's* matching Sentry span active for
// the duration, so work Mastra does inside — an outgoing model `fetch`, a `dataloader.load` in a tool —
// nests under it. Both live in the stable, unhashed `observability/context-storage` entry (a real
// package export, not a content-hashed chunk), so an exact-ish path match is safe. `functionName`
// selects the exported functions.
const mastraContextConfig: InstrumentationConfig[] = ['executeWithContext', 'executeWithContextSync'].map(
  functionName => ({
    channelName: 'mastraExecuteWithContext',
    module: {
      name: '@mastra/core',
      versionRange: '>=1.63.2 <2.0.0',
      filePath: /^dist\/observability\/context-storage\.(?:cjs|mjs|js)$/,
    },
    functionQuery: { functionName, kind: 'Auto' as const },
  }),
);

export const mastraConfig = [...mastraConstructorConfig, ...mastraContextConfig] satisfies InstrumentationConfig[];

export const mastraModuleNames = getModuleNames(mastraConfig);

export const mastraChannels = {
  MASTRA_CONSTRUCTOR: 'orchestrion:@mastra/core:mastraConstructor',
  MASTRA_EXECUTE_WITH_CONTEXT: 'orchestrion:@mastra/core:mastraExecuteWithContext',
} as const;
