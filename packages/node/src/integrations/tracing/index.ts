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
  redisIntegration,
  tediousIntegration,
  vercelAIIntegration,
} from '@sentry/server-utils/orchestrion';
import { fastifyIntegration } from './fastify';

export function getAutoPerformanceIntegrations(): Integration[] {
  return [
    expressIntegration(),
    fastifyIntegration(),
    graphqlDiagnosticsIntegration(),
    mongodbIntegration(),
    mongooseIntegration(),
    mysqlIntegration(),
    mysql2Integration(),
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
    vercelAIIntegration(),
    openAIIntegration(),
    anthropicIntegration(),
    googleGenAIIntegration(),
    postgresJsIntegration(),
    firebaseIntegration(),
  ];
}
