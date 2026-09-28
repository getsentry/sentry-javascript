import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

// `@modelcontextprotocol/server` v2 ships pre-bundled (tsdown) in content-hashed chunks:
// `class McpServer` lives only in `dist/mcp-<hash>.{mjs,cjs}` (2.0.0: `mcp-DXXb3Vv3.mjs`,
// `mcp-D7GmuPnv.cjs`), while the stable `dist/index.mjs` is a pure re-export. An exact
// `filePath` therefore cannot target the constructor, so the pattern matches any `mcp-*`
// chunk in `dist/` and `className: 'McpServer'` stays the real selector — the same shape
// `mastra.ts` uses for its hashed `Mastra` chunk. `McpServer.connect()` delegates to the
// underlying `Server`/`Protocol`, so hooking the constructor is enough to reach everything.
const mcpServerV2Config: InstrumentationConfig[] = [
  {
    channelName: 'mcpServerConstructor',
    module: {
      name: '@modelcontextprotocol/server',
      versionRange: '>=2.0.0 <3',
      filePath: /^dist\/mcp-[\w-]+\.(?:cjs|mjs)$/,
    },
    // No `methodName` → class constructor. The `end` message's `self` is the new instance.
    functionQuery: { className: 'McpServer' },
  },
];

// `@modelcontextprotocol/sdk` v1 ships unbundled, so `McpServer` sits at a stable path — the
// subpath export `.../server/mcp.js` resolves to `dist/{cjs,esm}/server/mcp.js`. The regex
// matches both build flavors from the module root without hard-coding the `dist/esm` vs
// `dist/cjs` prefix, and `className: 'McpServer'` stays the real selector.
const mcpServerV1Config: InstrumentationConfig[] = [
  {
    channelName: 'mcpServerConstructor',
    module: {
      name: '@modelcontextprotocol/sdk',
      versionRange: '>=1.9.0 <2',
      filePath: /(?:^|\/)server\/mcp\.js$/,
    },
    functionQuery: { className: 'McpServer' },
  },
];

export const mcpServerConfig = [...mcpServerV2Config, ...mcpServerV1Config] satisfies InstrumentationConfig[];

export const mcpServerModuleNames = getModuleNames(mcpServerConfig);

export const mcpServerChannels = {
  // Orchestrion prefixes each `channelName` with `orchestrion:${module.name}:`, so v1 and v2
  // publish to distinct channels even though the suffix is shared — the integration subscribes
  // to both.
  MCP_SERVER_V2_CONSTRUCTOR: 'orchestrion:@modelcontextprotocol/server:mcpServerConstructor',
  MCP_SERVER_V1_CONSTRUCTOR: 'orchestrion:@modelcontextprotocol/sdk:mcpServerConstructor',
} as const;
