import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';

export const expressConfig = [
  // Express funnels every middleware/route handler through a single method on
  // its routing `Layer`, so instrumenting that one method covers the whole
  // request pipeline. The `expressChannelIntegration` opens one span per layer
  // invocation. Both are `Layer.prototype.<method> = function <fn>(req, res, next)`
  // prototype assignments (not `class` methods), so `expressionName` (matching
  // the assignment's `left.property.name`) is used. `Callback`: the handler's
  // last argument is `next`, so the transform ends the traced operation when
  // `next` is invoked (and publishes `error` when it's called with an error).
  //
  // Express v4 ships its own router in `express/lib/router/layer.js`.
  {
    channelName: 'handle',
    module: { name: 'express', versionRange: '>=4.0.0 <5', filePath: 'lib/router/layer.js' },
    // v4's method is `Layer.prototype.handle_request = function handle(...)` —
    // match the assigned property name, not the function name.
    functionQuery: { expressionName: 'handle_request', kind: 'Callback' },
  },
  // Express v5 delegates routing to the standalone `router` package.
  {
    channelName: 'handle',
    module: { name: 'router', versionRange: '>=2.0.0 <3', filePath: 'lib/layer.js' },
    functionQuery: { expressionName: 'handleRequest', kind: 'Callback' },
  },
  // Layer *registration* methods. `Router.prototype.route`/`.use` are called
  // once per registered route/middleware (including internally by `app.get`/
  // `app.use`), so subscribing here lets us record each layer's registered path
  // *pattern* — which the handler path (`req.baseUrl`) can't recover for
  // parameterized mounts. `Sync`: these return synchronously and, unlike a
  // handler, `use`'s trailing function argument is a registration payload, not a
  // callback — so `Callback` would misclassify it and never fire `end`.
  //
  // Express v4 ships its own router in `express/lib/router/index.js`.
  {
    channelName: 'route',
    module: { name: 'express', versionRange: '>=4.0.0 <5', filePath: 'lib/router/index.js' },
    functionQuery: { expressionName: 'route', kind: 'Sync' },
  },
  {
    channelName: 'use',
    module: { name: 'express', versionRange: '>=4.0.0 <5', filePath: 'lib/router/index.js' },
    functionQuery: { expressionName: 'use', kind: 'Sync' },
  },
  // Express v5 delegates routing to the standalone `router` package.
  {
    channelName: 'route',
    module: { name: 'router', versionRange: '>=2.0.0 <3', filePath: 'index.js' },
    functionQuery: { expressionName: 'route', kind: 'Sync' },
  },
  {
    channelName: 'use',
    module: { name: 'router', versionRange: '>=2.0.0 <3', filePath: 'index.js' },
    functionQuery: { expressionName: 'use', kind: 'Sync' },
  },
] satisfies InstrumentationConfig[];

export const expressChannels = {
  // Express v4 runs each layer's handler through `Layer.prototype.handle_request`
  // in the `express` module.
  EXPRESS_HANDLE: 'orchestrion:express:handle',
  // Express v5 delegates routing to the standalone `router` package, where the
  // equivalent method is `Layer.prototype.handleRequest`.
  ROUTER_HANDLE: 'orchestrion:router:handle',
  // Layer *registration* (`Router.prototype.route`/`.use`), used to capture each
  // layer's registered path pattern so the matched route can be reconstructed
  // with its parameters intact (`req.baseUrl` only exposes the resolved prefix).
  EXPRESS_ROUTE: 'orchestrion:express:route',
  EXPRESS_USE: 'orchestrion:express:use',
  ROUTER_ROUTE: 'orchestrion:router:route',
  ROUTER_USE: 'orchestrion:router:use',
} as const;
