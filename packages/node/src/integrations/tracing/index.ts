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
import { fastifyIntegration } from './fastify';
import { redisIntegration } from './redis';

export function getAutoPerformanceIntegrations(): Integration[] {
  return [
    expressIntegration(),
    fastifyIntegration(),
    graphqlDiagnosticsIntegration(),
    mongodbIntegration(),
    mongooseIntegration(),
    mysqlIntegration(),
    mysql2Integration(),
    // Redis keeps the node wrapper: it wires the cache `responseHook` into the channel subscribers
    // and covers all redis client versions (native diagnostics_channel + orchestrion fallbacks).
    redisIntegration(),
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
  return [instrumentSentryHttp];
}
