import type { InstrumentationConfig } from '../apmTypes';

// Remix 3 is a ground up rewrite sharing no modules with Remix 2, so it gets its own config rather
// than a widened `versionRange` on `./remix.ts`. The two never collide: this matches the
// `@remix-run/*` packages, that one `@remix-run/server-runtime`. Ranges start at the release
// candidates and end before 2.0.0, because the packages went 0.x to 1.0.0 with Remix 3.0.0.
//
// `remix/router` is a one line `export * from '@remix-run/fetch-router'`, so matching the real module
// covers both import styles.
export const remixV3Config: InstrumentationConfig[] = [
  // The only construction point routing needs: `router.mount()` does not create a sub-router, it
  // builds a prefixed route builder over the same matcher and dispatch.
  {
    channelName: 'createRouter',
    module: {
      name: '@remix-run/fetch-router',
      versionRange: '>=0.21.0 <2',
      filePath: 'dist/lib/router.js',
    },
    functionQuery: { functionName: 'createRouter', kind: 'Sync' },
  },
  // The subscriber rewrites the options before the asset server reads them and wraps the server it
  // returns, so browser modules carry debug IDs without any config from the app.
  {
    channelName: 'createAssetServer',
    module: { name: '@remix-run/assets', versionRange: '>=0.6.0 <2', filePath: 'dist/lib/asset-server.js' },
    functionQuery: { functionName: 'createAssetServer', kind: 'Sync' },
  },
  // The only error hook that covers an app whose fetch handler is not a router.
  {
    channelName: 'createRequestListener',
    module: {
      name: '@remix-run/node-fetch-server',
      versionRange: '>=0.14.0 <2',
      filePath: 'dist/lib/request-listener.js',
    },
    functionQuery: { functionName: 'createRequestListener', kind: 'Sync' },
  },
  // Browser side, applied by the asset server's loader chain. The only way to see component render
  // errors without application code. `@remix-run/ui` was renamed to `@remix-run/component` in 1.0.0.
  {
    channelName: 'run',
    module: { name: '@remix-run/ui', versionRange: '>=0.8.0 <1', filePath: 'dist/runtime/run.js' },
    functionQuery: { functionName: 'run', kind: 'Sync' },
  },
  {
    channelName: 'run',
    module: { name: '@remix-run/component', versionRange: '>=1.0.0 <2', filePath: 'dist/runtime/run.js' },
    functionQuery: { functionName: 'run', kind: 'Sync' },
  },
];

export const remixV3Channels = {
  REMIX_V3_CREATE_ROUTER: 'orchestrion:@remix-run/fetch-router:createRouter',
  REMIX_V3_CREATE_ASSET_SERVER: 'orchestrion:@remix-run/assets:createAssetServer',
  REMIX_V3_CREATE_REQUEST_LISTENER: 'orchestrion:@remix-run/node-fetch-server:createRequestListener',
  REMIX_V3_UI_RUN: 'orchestrion:@remix-run/ui:run',
  REMIX_V3_COMPONENT_RUN: 'orchestrion:@remix-run/component:run',
} as const;
