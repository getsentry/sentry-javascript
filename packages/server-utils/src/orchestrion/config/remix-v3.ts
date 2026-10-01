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
];

export const remixV3Channels = {
  REMIX_V3_CREATE_ROUTER: 'orchestrion:@remix-run/fetch-router:createRouter',
} as const;
