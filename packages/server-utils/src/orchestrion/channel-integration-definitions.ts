/**
 * Build-time metadata for the orchestrion channel integrations: for each one, the
 * name it is exported under from `./index` (`exportName`) and the package(s) it
 * instruments (`modules`).
 *
 * Kept in a separate, factory-free module on purpose: the `@sentry/server-utils/orchestrion/vite`
 * plugin reads it to generate the registration module it injects into an app's server bundle, and
 * must not drag any subscriber code into its own build to do so. The runtime registry in `./index`
 * (`channelIntegrations`, `registerChannelIntegrations`) consumes the same data, so the two can't
 * drift — `./index` asserts the keys here match `channelIntegrations` at compile time.
 *
 * `exportName` must be a named export of `./index`; `modules` must match the `module.name` values in
 * `SENTRY_INSTRUMENTATIONS` (the `config/` files) — e.g. `postgresIntegration` covers both `pg` and
 * `pg-pool`.
 */
export const CHANNEL_INTEGRATION_DEFINITIONS = {
  postgresIntegration: { exportName: 'postgresChannelIntegration', modules: ['pg', 'pg-pool'] },
  postgresJsIntegration: { exportName: 'postgresJsChannelIntegration', modules: ['postgres'] },
  mysqlIntegration: { exportName: 'mysqlChannelIntegration', modules: ['mysql'] },
  genericPoolIntegration: { exportName: 'genericPoolChannelIntegration', modules: ['generic-pool'] },
  lruMemoizerIntegration: { exportName: 'lruMemoizerChannelIntegration', modules: ['lru-memoizer'] },
  openaiIntegration: { exportName: 'openaiChannelIntegration', modules: ['openai'] },
  anthropicIntegration: { exportName: 'anthropicChannelIntegration', modules: ['@anthropic-ai/sdk'] },
  googleGenAIIntegration: { exportName: 'googleGenAIChannelIntegration', modules: ['@google/genai'] },
  vercelAiIntegration: { exportName: 'vercelAiChannelIntegration', modules: ['ai'] },
  amqplibIntegration: { exportName: 'amqplibChannelIntegration', modules: ['amqplib'] },
  hapiIntegration: { exportName: 'hapiChannelIntegration', modules: ['@hapi/hapi'] },
  expressIntegration: { exportName: 'expressChannelIntegration', modules: ['express'] },
  graphqlIntegration: { exportName: 'graphqlDiagnosticsChannelIntegration', modules: ['graphql'] },
  kafkajsIntegration: { exportName: 'kafkajsChannelIntegration', modules: ['kafkajs'] },
} as const satisfies Record<string, { exportName: string; modules: readonly string[] }>;

export type ChannelIntegrationKey = keyof typeof CHANNEL_INTEGRATION_DEFINITIONS;
