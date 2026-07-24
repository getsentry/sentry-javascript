import type { Integration } from '@sentry/core';
import { prismaIntegration } from '@sentry/server-utils';
import {
  amqplibChannelIntegration,
  anthropicChannelIntegration,
  expressChannelIntegration,
  firebaseChannelIntegration,
  genericPoolChannelIntegration,
  googleGenAIChannelIntegration,
  graphqlDiagnosticsChannelIntegration,
  hapiChannelIntegration,
  kafkajsChannelIntegration,
  koaChannelIntegration,
  langChainChannelIntegration,
  langGraphChannelIntegration,
  lruMemoizerChannelIntegration,
  mongodbChannelIntegration,
  mongooseChannelIntegration,
  mysqlChannelIntegration,
  mysql2ChannelIntegration,
  openaiChannelIntegration,
  postgresChannelIntegration,
  postgresJsChannelIntegration,
  tediousChannelIntegration,
  vercelAiChannelIntegration,
} from '@sentry/server-utils/orchestrion';
import { instrumentSentryHttp } from '../http';
import { fastifyIntegration, instrumentFastifyV3 } from './fastify';
import { redisChannelIntegrations } from './redis';

/**
 * With OTEL, all performance integrations will be added, as OTEL only initializes them when the patched package is actually required.
 */
export function getAutoPerformanceIntegrations(): Integration[] {
  return [
    expressChannelIntegration(),
    // Fastify keeps the node wrapper: the streamlined integration covers fastify `>=3.21.0 <6`, and
    // the wrapper adds `instrumentFastifyV3` for the remaining early-v3 range (`>=3.0.0 <3.21.0`).
    fastifyIntegration(),
    graphqlDiagnosticsChannelIntegration(),
    mongodbChannelIntegration(),
    mongooseChannelIntegration(),
    mysqlChannelIntegration(),
    mysql2ChannelIntegration(),
    // Redis keeps the node wrapper: it wires the cache `responseHook` into the channel integrations.
    ...redisChannelIntegrations(),
    postgresChannelIntegration(),
    prismaIntegration(),
    hapiChannelIntegration(),
    koaChannelIntegration(),
    tediousChannelIntegration(),
    genericPoolChannelIntegration(),
    kafkajsChannelIntegration(),
    amqplibChannelIntegration(),
    lruMemoizerChannelIntegration(),
    // AI providers
    // LangChain must come first to disable AI provider integrations before they instrument
    langChainChannelIntegration(),
    langGraphChannelIntegration(),
    vercelAiChannelIntegration(),
    openaiChannelIntegration(),
    anthropicChannelIntegration(),
    googleGenAIChannelIntegration(),
    postgresJsChannelIntegration(),
    firebaseChannelIntegration(),
  ];
}

/**
 * Get a list of methods to instrument OTEL, when preload instrumentation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getOpenTelemetryInstrumentationToPreload(): (((options?: any) => void) & { id: string })[] {
  return [
    instrumentSentryHttp,
    // The streamlined `Fastify` integration covers fastify `>=3.21.0 <6`; `instrumentFastifyV3`
    // fills the remaining early-v3 gap (`>=3.0.0 <3.21.0`), so it stays preloaded here.
    instrumentFastifyV3,
  ];
}
