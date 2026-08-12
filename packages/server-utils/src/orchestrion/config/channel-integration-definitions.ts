/**
 * Build-time metadata mapping each instrumented package (orchestrion
 * `module.name`) to the channel-subscriber integration that consumes the
 * channels injected into it — by the `exportName` it is published under from
 * `@sentry/server-utils/orchestrion`.
 *
 * Kept in a separate, factory-free module on purpose: the module-injected
 * transform (reachable from every orchestrion bundler plugin) reads this to
 * generate the tiny snippet it injects into each instrumented file, and must
 * not drag any subscriber code — or its `@sentry/core` span machinery — into
 * the plugin's own build to do so.
 *
 * `exportName` must be a named export of `@sentry/server-utils/orchestrion`.
 * `modules` must match `module.name` values in `SENTRY_INSTRUMENTATIONS` — e.g.
 * `postgresIntegration` covers both `pg` and `pg-pool`, and `redisIntegration`
 * covers `redis`, `@redis/client` and `ioredis`.
 *
 * `redis`, `ioredis` and `dataloader` are included even though they're not in
 * the node SDK's `channelIntegrations` (they only partially replace an OTel
 * integration there): in a bundler-only runtime like Cloudflare Workers there
 * is no OTel integration to coordinate with, so subscribing whenever the
 * package is bundled is unconditionally correct.
 */
export const CHANNEL_INTEGRATION_DEFINITIONS = [
  { exportName: 'postgresIntegration', modules: ['pg', 'pg-pool'] },
  { exportName: 'postgresJsIntegration', modules: ['postgres'] },
  { exportName: 'mysqlIntegration', modules: ['mysql'] },
  { exportName: 'mysql2Integration', modules: ['mysql2'] },
  { exportName: 'genericPoolIntegration', modules: ['generic-pool'] },
  { exportName: 'lruMemoizerIntegration', modules: ['lru-memoizer'] },
  { exportName: 'openAIIntegration', modules: ['openai'] },
  { exportName: 'anthropicIntegration', modules: ['@anthropic-ai/sdk'] },
  { exportName: 'googleGenAIIntegration', modules: ['@google/genai'] },
  { exportName: 'vercelAIIntegration', modules: ['ai'] },
  { exportName: 'amqplibIntegration', modules: ['amqplib'] },
  { exportName: 'hapiIntegration', modules: ['@hapi/hapi'] },
  { exportName: 'expressIntegration', modules: ['express', 'router'] },
  { exportName: 'graphqlIntegration', modules: ['graphql'] },
  { exportName: 'kafkaIntegration', modules: ['kafkajs'] },
  { exportName: 'redisIntegration', modules: ['redis', '@redis/client', 'ioredis'] },
  { exportName: 'dataloaderIntegration', modules: ['dataloader'] },
] as const satisfies ReadonlyArray<{ exportName: string; modules: readonly string[] }>;

/** Look up the subscriber export name for an instrumented package, if any. */
export function subscriberExportForModule(moduleName: string): string | undefined {
  return CHANNEL_INTEGRATION_DEFINITIONS.find(d => (d.modules as readonly string[]).includes(moduleName))?.exportName;
}
