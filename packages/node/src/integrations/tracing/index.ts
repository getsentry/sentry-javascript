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
  openAIIntegration,
  postgresIntegration,
  postgresJsIntegration,
  tediousIntegration,
  vercelAiIntegration,
} from '@sentry/server-utils/orchestrion';
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
    // Redis keeps the node wrapper: it composes the ioredis + redis channel integrations into one
    // integration covering all client versions (native diagnostics_channel + orchestrion fallbacks).
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
    openAIIntegration(),
    anthropicIntegration(),
    googleGenAIIntegration(),
    postgresJsIntegration(),
    firebaseIntegration(),
  ];
}
