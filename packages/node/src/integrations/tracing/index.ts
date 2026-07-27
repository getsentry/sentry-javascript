import type { Integration } from '@sentry/core';
import { prismaIntegration } from '@sentry/server-utils';
import {
  amqplibIntegration,
  anthropicIntegration,
  expressIntegration,
  firebaseIntegration,
  genericPoolIntegration,
  googleGenAIIntegration,
  graphqlDiagnosticsIntegration,
  hapiIntegration,
  kafkajsIntegration,
  koaIntegration,
  langChainIntegration,
  langGraphIntegration,
  lruMemoizerIntegration,
  mongodbIntegration,
  mongooseIntegration,
  mysqlIntegration,
  mysql2Integration,
  openaiIntegration,
  postgresIntegration,
  postgresJsIntegration,
  tediousIntegration,
  vercelAiIntegration,
} from '@sentry/server-utils/orchestrion';
import { instrumentSentryHttp } from '../http';
import { fastifyIntegration, instrumentFastifyV3 } from './fastify';
import { redisChannelIntegrations } from './redis';

export function getAutoPerformanceIntegrations(): Integration[] {
  return [
    expressIntegration(),
    // Fastify keeps the node wrapper: the streamlined integration covers fastify `>=3.21.0 <6`, and
    // the wrapper adds `instrumentFastifyV3` for the remaining early-v3 range (`>=3.0.0 <3.21.0`).
    fastifyIntegration(),
    graphqlDiagnosticsIntegration(),
    mongodbIntegration(),
    mongooseIntegration(),
    mysqlIntegration(),
    mysql2Integration(),
    // Redis keeps the node wrapper: it wires the cache `responseHook` into the channel integrations.
    ...redisChannelIntegrations(),
    postgresIntegration(),
    prismaIntegration(),
    hapiIntegration(),
    koaIntegration(),
    tediousIntegration(),
    genericPoolIntegration(),
    kafkajsIntegration(),
    amqplibIntegration(),
    lruMemoizerIntegration(),
    // AI providers
    // LangChain must come first to disable AI provider integrations before they instrument
    langChainIntegration(),
    langGraphIntegration(),
    vercelAiIntegration(),
    openaiIntegration(),
    anthropicIntegration(),
    googleGenAIIntegration(),
    postgresJsIntegration(),
    firebaseIntegration(),
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
