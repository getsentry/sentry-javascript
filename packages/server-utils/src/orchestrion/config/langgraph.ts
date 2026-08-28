import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

// `@langchain/langgraph` ships dual CJS/ESM builds (`.cjs` for `require`, `.js` for `import`) and the
// matcher compares `filePath` exactly, so each hook is declared once per built file. `StateGraph.compile`
// and `createReactAgent` both return synchronously; the subscriber wraps the returned compiled graph's
// `invoke` (mirroring the vendored OTel instrumentation, which patched these on the module exports).
const module = (filePath: string): InstrumentationConfig['module'] => ({
  name: '@langchain/langgraph',
  versionRange: '>=0.0.0 <2.0.0',
  filePath,
});

const compileConfig = ['dist/graph/state.cjs', 'dist/graph/state.js'].map(filePath => ({
  channelName: 'stateGraphCompile',
  module: module(filePath),
  functionQuery: { className: 'StateGraph', methodName: 'compile', kind: 'Sync' as const },
}));

// `createReactAgent` is a single function declaration re-exported from both `@langchain/langgraph` and
// `@langchain/langgraph/prebuilt`; hooking its definition file covers every import path.
const createReactAgentConfig = ['dist/prebuilt/react_agent_executor.cjs', 'dist/prebuilt/react_agent_executor.js'].map(
  filePath => ({
    channelName: 'createReactAgent',
    module: module(filePath),
    functionQuery: { functionName: 'createReactAgent', kind: 'Sync' as const },
  }),
);

export const langgraphConfig = [...compileConfig, ...createReactAgentConfig] satisfies InstrumentationConfig[];

export const langgraphModuleNames = getModuleNames(langgraphConfig);

export const langgraphChannels = {
  LANGGRAPH_STATE_GRAPH_COMPILE: 'orchestrion:@langchain/langgraph:stateGraphCompile',
  LANGGRAPH_CREATE_REACT_AGENT: 'orchestrion:@langchain/langgraph:createReactAgent',
} as const;
