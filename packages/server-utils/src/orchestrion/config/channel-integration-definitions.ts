/**
 * Build-time metadata mapping each channel-subscriber integration — by the
 * `exportName` it is published under from `@sentry/server-utils/orchestrion` —
 * to the instrumented packages (orchestrion `module.name`) whose channels it
 * consumes.
 *
 * Kept in a separate, factory-free module on purpose: the module-injected
 * transform (reachable from every orchestrion bundler plugin) reads this to
 * generate the tiny snippet it injects into each instrumented file, and must
 * not drag any subscriber code — or its `@sentry/core` span machinery — into
 * the plugin's own build to do so.
 *
 * `exportName` must be a named export of `@sentry/server-utils/orchestrion`.
 * `modules` must match `module.name` values in `SENTRY_INSTRUMENTATIONS` — e.g.
 * `postgresIntegration` covers both `pg` and `pg-pool`.
 *
 * `redis`, `ioredis`, `knex` and `dataloader` are included even though they're
 * not in the node SDK's `channelIntegrations` (they only partially replace an
 * OTel integration there, or are opt-in): in a bundler-only runtime like
 * Cloudflare Workers there is no OTel integration to coordinate with, so
 * subscribing whenever the package is bundled is unconditionally correct.
 */
export const CHANNEL_INTEGRATION_DEFINITIONS = [
  { exportName: 'postgresIntegration', modules: ['pg', 'pg-pool'] },
  { exportName: 'postgresJsIntegration', modules: ['postgres'] },
  { exportName: 'mysqlIntegration', modules: ['mysql'] },
  { exportName: 'mysql2Integration', modules: ['mysql2'] },
  { exportName: 'mongodbIntegration', modules: ['mongodb'] },
  { exportName: 'mongooseIntegration', modules: ['mongoose'] },
  { exportName: 'knexIntegration', modules: ['knex'] },
  { exportName: 'tediousIntegration', modules: ['tedious'] },
  { exportName: 'genericPoolIntegration', modules: ['generic-pool'] },
  { exportName: 'lruMemoizerIntegration', modules: ['lru-memoizer'] },
  { exportName: 'openaiIntegration', modules: ['openai'] },
  { exportName: 'anthropicIntegration', modules: ['@anthropic-ai/sdk'] },
  { exportName: 'googleGenAIIntegration', modules: ['@google/genai'] },
  { exportName: 'vercelAiIntegration', modules: ['ai'] },
  {
    exportName: 'langChainIntegration',
    modules: [
      '@langchain/core',
      '@langchain/openai',
      '@langchain/google-common',
      '@langchain/google-genai',
      '@langchain/mistralai',
    ],
  },
  { exportName: 'langGraphIntegration', modules: ['@langchain/langgraph'] },
  { exportName: 'awsIntegration', modules: ['@aws-sdk/smithy-client', '@smithy/core', '@smithy/smithy-client'] },
  { exportName: 'firebaseIntegration', modules: ['@firebase/firestore', 'firebase-functions'] },
  { exportName: 'amqplibIntegration', modules: ['amqplib'] },
  { exportName: 'hapiIntegration', modules: ['@hapi/hapi'] },
  { exportName: 'koaIntegration', modules: ['koa'] },
  { exportName: 'expressIntegration', modules: ['express', 'router'] },
  { exportName: 'graphqlIntegration', modules: ['graphql'] },
  { exportName: 'kafkajsIntegration', modules: ['kafkajs'] },
  { exportName: 'redisChannelIntegration', modules: ['redis', '@redis/client'] },
  { exportName: 'ioredisChannelIntegration', modules: ['ioredis'] },
  // The native-channel subscriber, covering the versions the two rows above stop
  // short of (node-redis >= 5.12.0, ioredis >= 5.11.0).
  { exportName: 'redisIntegration', modules: ['redis', '@redis/client', 'ioredis'] },
  { exportName: 'dataloaderIntegration', modules: ['dataloader'] },
] as const satisfies ReadonlyArray<{ exportName: string; modules: readonly string[] }>;

/**
 * The subscriber export names for an instrumented package, in table order.
 * Empty when the package has no subscriber.
 */
export function subscriberExportsForModule(moduleName: string): string[] {
  return CHANNEL_INTEGRATION_DEFINITIONS.filter(d => (d.modules as readonly string[]).includes(moduleName)).map(
    d => d.exportName,
  );
}
