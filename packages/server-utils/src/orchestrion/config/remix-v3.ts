import type { InstrumentationConfig } from '../apmTypes';

// Remix 3 is a ground up rewrite sharing no modules with Remix 2, so it gets its own config rather
// than a widened `versionRange` on `./remix.ts`. The two never collide: this matches the
// `@remix-run/*` 0.x packages, that one `@remix-run/server-runtime`.
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
      // Still 0.x during the Remix 3 release candidate, so the range is deliberately narrow.
      versionRange: '>=0.21.0 <1',
      filePath: 'dist/lib/router.js',
    },
    functionQuery: { functionName: 'createRouter', kind: 'Sync' },
  },
  // The subscriber rewrites the options before the asset server reads them and wraps the server it
  // returns, so browser modules carry debug IDs without any config from the app.
  {
    channelName: 'createAssetServer',
    module: { name: '@remix-run/assets', versionRange: '>=0.6.0 <1', filePath: 'dist/lib/asset-server.js' },
    functionQuery: { functionName: 'createAssetServer', kind: 'Sync' },
  },
  // The only error hook that covers an app whose fetch handler is not a router.
  {
    channelName: 'createRequestListener',
    module: {
      name: '@remix-run/node-fetch-server',
      versionRange: '>=0.14.0 <1',
      filePath: 'dist/lib/request-listener.js',
    },
    functionQuery: { functionName: 'createRequestListener', kind: 'Sync' },
  },
];

export const remixV3Channels = {
  REMIX_V3_CREATE_ROUTER: 'orchestrion:@remix-run/fetch-router:createRouter',
  REMIX_V3_CREATE_ASSET_SERVER: 'orchestrion:@remix-run/assets:createAssetServer',
  REMIX_V3_CREATE_REQUEST_LISTENER: 'orchestrion:@remix-run/node-fetch-server:createRequestListener',
} as const;
