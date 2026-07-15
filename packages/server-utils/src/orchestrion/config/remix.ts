import type { InstrumentationConfig } from '..';

// Ports the vendored `RemixInstrumentation` (an OTel `InstrumentationBase` that patched
// `@remix-run/server-runtime`) to orchestrion channel injection. The subscriber lives in
// `@sentry/remix` (`instrumentRemix`), because it needs remix-specific SDK options.
//
// Four concepts, one channel each. Where a function was renamed across the supported range, both
// names publish to the same channel so the subscriber only ever knows one name per concept:
//   - `requestHandler`    → the async handler returned by `createRequestHandler` (the server span)
//   - `matchServerRoutes` → sync route match; enriches the active span (creates no span of its own)
//   - `callRouteLoader`   → LOADER span. Remix 2.0–2.8 named it `callRouteLoaderRR`.
//   - `callRouteAction`   → ACTION span. Remix 2.0–2.8 named it `callRouteActionRR`.
//
// Emitted for both the CJS (`dist/*`) and ESM (`dist/esm/*`) builds, which share function shapes.
const remixInstrumentationConfig = (dir: string): InstrumentationConfig[] => [
  // `createRequestHandler` returns `async function requestHandler(request, loadContext)` — the main
  // server span. We target the returned handler (so the span wraps each request, not the one-time
  // handler construction). It's a *named function expression*, which name-based `functionQuery`
  // can't match (that only sees declarations), so we select it with `astQuery`; `functionQuery`
  // then just carries the behaviour (`kind: 'Async'`).
  {
    channelName: 'requestHandler',
    module: { name: '@remix-run/server-runtime', versionRange: '>=2.0.0 <3', filePath: `${dir}/server.js` },
    astQuery: 'FunctionExpression[id.name="requestHandler"]',
    functionQuery: { kind: 'Async' },
  },
  // Sync; the subscriber reads its result to set `http.route` on the active request span.
  {
    channelName: 'matchServerRoutes',
    module: { name: '@remix-run/server-runtime', versionRange: '>=2.0.0 <3', filePath: `${dir}/routeMatching.js` },
    functionQuery: { functionName: 'matchServerRoutes', kind: 'Sync' },
  },
  // Remix >= 2.9.0
  {
    channelName: 'callRouteLoader',
    module: { name: '@remix-run/server-runtime', versionRange: '>=2.9.0 <3', filePath: `${dir}/data.js` },
    functionQuery: { functionName: 'callRouteLoader', kind: 'Async' },
  },
  {
    channelName: 'callRouteAction',
    module: { name: '@remix-run/server-runtime', versionRange: '>=2.9.0 <3', filePath: `${dir}/data.js` },
    functionQuery: { functionName: 'callRouteAction', kind: 'Async' },
  },
  // Remix 2.0.0 – 2.8.x: the same functions were suffixed `…RR`. Same channels as above.
  {
    channelName: 'callRouteLoader',
    module: { name: '@remix-run/server-runtime', versionRange: '>=2.0.0 <2.9.0', filePath: `${dir}/data.js` },
    functionQuery: { functionName: 'callRouteLoaderRR', kind: 'Async' },
  },
  {
    channelName: 'callRouteAction',
    module: { name: '@remix-run/server-runtime', versionRange: '>=2.0.0 <2.9.0', filePath: `${dir}/data.js` },
    functionQuery: { functionName: 'callRouteActionRR', kind: 'Async' },
  },
];

export const remixConfig = ['dist', 'dist/esm'].flatMap(remixInstrumentationConfig);

export const remixChannels = {
  REMIX_REQUEST_HANDLER: 'orchestrion:@remix-run/server-runtime:requestHandler',
  REMIX_MATCH_SERVER_ROUTES: 'orchestrion:@remix-run/server-runtime:matchServerRoutes',
  REMIX_CALL_ROUTE_LOADER: 'orchestrion:@remix-run/server-runtime:callRouteLoader',
  REMIX_CALL_ROUTE_ACTION: 'orchestrion:@remix-run/server-runtime:callRouteAction',
} as const;
