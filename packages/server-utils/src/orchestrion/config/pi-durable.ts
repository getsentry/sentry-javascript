import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

const module = { name: '@earendil-works/pi-durable', versionRange: '>=1.0.0 <2.0.0' };

// `Harness.open(storage, options, context)` is a method of the exported `Harness` object literal, the
// one entry point to a Harness. Its `options` carry the `models` and `registry` every model request
// and task phase goes through, so wrapping them at `start` covers the whole Harness.
export const piDurableConfig = [
  {
    channelName: 'harnessOpen',
    module: { ...module, filePath: 'dist/harness/harness.js' },
    functionQuery: { methodName: 'open', kind: 'Async' as const },
  },
  // The factories of the built-in coding tools. Their tools throw to report expected failures to the
  // model, so the integration must know them wherever an app registers them.
  ...[
    ['bash', 'createBashTool'],
    ['read', 'createReadTool'],
    ['edit', 'createEditTool'],
    ['write', 'createWriteTool'],
  ].map(([file, functionName]) => ({
    channelName: 'codingTool',
    module: { ...module, filePath: `dist/tools/${file}.js` },
    functionQuery: { functionName: functionName as string, kind: 'Sync' as const },
  })),
] satisfies InstrumentationConfig[];

export const piDurableModuleNames = getModuleNames(piDurableConfig);

export const piDurableChannels = {
  PI_DURABLE_HARNESS_OPEN: 'orchestrion:@earendil-works/pi-durable:harnessOpen',
  PI_DURABLE_CODING_TOOL: 'orchestrion:@earendil-works/pi-durable:codingTool',
} as const;
