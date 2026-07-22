import type { Integration } from '@sentry/core';
import { prismaIntegration } from '@sentry/server-utils';
import { instrumentSentryHttp } from '../http';
import { amqplibIntegration } from './amqplib';
import { anthropicAIIntegration } from './anthropic-ai';
import { expressIntegration } from './express';
import { fastifyIntegration, instrumentFastifyV3 } from './fastify';
import { firebaseIntegration } from './firebase';
import { genericPoolIntegration } from './genericPool';
import { googleGenAIIntegration } from './google-genai';
import { graphqlIntegration } from './graphql';
import { hapiIntegration } from './hapi';
import { kafkaIntegration } from './kafka';
import { koaIntegration } from './koa';
import { langChainIntegration } from './langchain';
import { langGraphIntegration } from './langgraph';
import { lruMemoizerIntegration } from './lrumemoizer';
import { mongoIntegration } from './mongo';
import { mongooseIntegration } from './mongoose';
import { mysqlIntegration } from './mysql';
import { mysql2Integration } from './mysql2';
import { openAIIntegration } from './openai';
import { postgresIntegration } from './postgres';
import { postgresJsIntegration } from './postgresjs';
import { instrumentRedis, redisChannelIntegrations } from './redis';
import { tediousIntegration } from './tedious';
import { vercelAIIntegration } from './vercelai';

/**
 * With OTEL, all performance integrations will be added, as OTEL only initializes them when the patched package is actually required.
 */
export function getAutoPerformanceIntegrations(): Integration[] {
  return [
    expressIntegration(),
    fastifyIntegration(),
    graphqlIntegration(),
    mongoIntegration(),
    mongooseIntegration(),
    mysqlIntegration(),
    mysql2Integration(),
    ...redisChannelIntegrations(),
    postgresIntegration(),
    prismaIntegration(),
    hapiIntegration(),
    koaIntegration(),
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
    // Redis's composite integration keeps the vendored OTel patchers for runtimes without
    // `tracingChannel` (Node <18.19); `instrumentRedis` internally gates on that, so preloading it is
    // a no-op on modern Node (where the channel subscribers own instrumentation) and only patches on
    // older runtimes.
    instrumentRedis,
  ];
}
