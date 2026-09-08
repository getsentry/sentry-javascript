/**
 * Build-time metadata mapping each channel-subscriber integration — by the
 * `exportName` it is published under from `@sentry/server-utils` — to the
 * instrumented packages (orchestrion `module.name`) whose channels it
 * consumes.
 *
 * Kept in a separate, factory-free module on purpose: the module-injected
 * transform (reachable from every orchestrion bundler plugin) reads this to
 * generate the tiny snippet it injects into each instrumented file, and must
 * not drag any subscriber code — or its `@sentry/core` span machinery — into
 * the plugin's own build to do so.
 *
 * `exportName` must be a named export of `@sentry/server-utils`.
 * `modules` must match `module.name` values in `SENTRY_INSTRUMENTATIONS` — e.g.
 * `postgresIntegration` covers both `pg` and `pg-pool`, and `redisIntegration`
 * covers `redis`, `@redis/client` and `ioredis`.
 */
export const CHANNEL_INTEGRATION_DEFINITIONS = [
  { exportName: 'postgresIntegration', modules: ['pg', 'pg-pool'] },
  { exportName: 'postgresJsIntegration', modules: ['postgres'] },
  { exportName: 'mysqlIntegration', modules: ['mysql'] },
  { exportName: 'mysql2Integration', modules: ['mysql2'] },
  { exportName: 'mongoIntegration', modules: ['mongodb'] },
  { exportName: 'mongooseIntegration', modules: ['mongoose'] },
  { exportName: 'knexIntegration', modules: ['knex'] },
  { exportName: 'tediousIntegration', modules: ['tedious'] },
  { exportName: 'genericPoolIntegration', modules: ['generic-pool'] },
  { exportName: 'lruMemoizerIntegration', modules: ['lru-memoizer'] },
  { exportName: 'openAIIntegration', modules: ['openai'] },
  { exportName: 'anthropicAIIntegration', modules: ['@anthropic-ai/sdk'] },
  { exportName: 'googleGenAIIntegration', modules: ['@google/genai'] },
  { exportName: 'vercelAIIntegration', modules: ['ai'] },
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
  { exportName: 'mastraIntegration', modules: ['@mastra/core'] },
  { exportName: 'awsIntegration', modules: ['@aws-sdk/smithy-client', '@smithy/core', '@smithy/smithy-client'] },
  { exportName: 'firebaseIntegration', modules: ['@firebase/firestore', 'firebase-functions'] },
  { exportName: 'amqplibIntegration', modules: ['amqplib'] },
  { exportName: 'hapiIntegration', modules: ['@hapi/hapi'] },
  { exportName: 'koaIntegration', modules: ['koa'] },
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
