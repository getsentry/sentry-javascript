import type { Integration } from '@sentry/core';
import {
  prismaIntegration,
  amqplibIntegration,
  anthropicAIIntegration,
  firebaseIntegration,
  genericPoolIntegration,
  googleGenAIIntegration,
  graphqlIntegration,
  kafkaIntegration,
  langChainIntegration,
  langGraphIntegration,
  lruMemoizerIntegration,
  mongoIntegration,
  mongooseIntegration,
  mysqlIntegration,
  mysql2Integration,
  openAIIntegration,
  postgresIntegration,
  postgresJsIntegration,
  redisIntegration,
  tediousIntegration,
  vercelAIIntegration,
} from '@sentry/server-utils';

export function getAutoPerformanceIntegrations(): Integration[] {
  // The following integrations are not considered performance integrations because they are "framework"-level
  // meaning they may also handle error capture and similar things.
  // Thus, we add them by default:
  // express, fastify, hapi, koa
  return [
    graphqlIntegration(),
    mongoIntegration(),
    mongooseIntegration(),
    mysqlIntegration(),
    mysql2Integration(),
    redisIntegration(),
    postgresIntegration(),
    prismaIntegration(),
    tediousIntegration(),
    genericPoolIntegration(),
    kafkaIntegration(),
    amqplibIntegration(),
    lruMemoizerIntegration(),
    // AI providers
    // LangChain must come first to disable AI provider integrations before they instrument
    langChainIntegration(),
    langGraphIntegration(),
    vercelAIIntegration(),
    openAIIntegration(),
    anthropicAIIntegration(),
    googleGenAIIntegration(),
    postgresJsIntegration(),
    firebaseIntegration(),
  ];
}
