/**
 * Fully-qualified `diagnostics_channel` names that orchestrion publishes to.
 *
 * Orchestrion's transform always prefixes the configured `channelName` with
 * `orchestrion:${module.name}:`. So a config of
 *   `{ channelName: 'query', module: { name: 'mysql' } }`
 * publishes to `orchestrion:mysql:query`.
 *
 * Subscribers (`integrations/<lib>/tracing-channel.ts`) consume the full
 * prefixed string from this map; the config files set only the unprefixed
 * suffix in `channelName`. Keeping both pieces in one file is what guarantees
 * they don't drift apart and silently stop firing.
 */
export const CHANNELS = {
  MYSQL_QUERY: 'orchestrion:mysql:query',
  LRU_MEMOIZER_LOAD: 'orchestrion:lru-memoizer:load',
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

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
