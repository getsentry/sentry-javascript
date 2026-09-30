import { amqplibIntegration } from './amqplib';
import { dataloaderIntegration } from './dataloader';
import { knexIntegration } from './knex';
import { mongoIntegration } from './mongodb';
import { graphqlIntegration } from './graphql';
import { redisIntegration } from './redis';
import { mysqlIntegration } from './mysql';
import { mysql2Integration } from './mysql2';
import { postgresIntegration } from './postgres';
import { prismaIntegration } from './prisma';
import { tediousIntegration } from './tedious';
import { genericPoolIntegration } from './generic-pool';
import { kafkaIntegration } from './kafkajs';
import { mongooseIntegration } from './mongoose';
import { lruMemoizerIntegration } from './lru-memoizer';
import { langChainIntegration } from './langchain';
import { langGraphIntegration } from './langgraph';
import { mastraIntegration } from './mastra';
import { mcpServerIntegration } from './mcp-server';
import { vercelAIIntegration } from './vercel-ai';
import { openAIIntegration } from './openai';
import { anthropicAIIntegration } from './anthropic';
import { googleGenAIIntegration } from './google-genai';
import { mistralAIIntegration } from './mistral';
import { groqIntegration } from './groq';
import { togetherAIIntegration } from './together-ai';
import { typesafeIntegration } from './typesafe';
import { postgresJsIntegration } from './postgres-js';
import { firebaseIntegration } from './firebase';
import { expressIntegration } from './express';
import { fastifyIntegration } from './fastify';
import { nitroIntegration, nitroServerTimingIntegration } from './nitro';
import { hapiIntegration } from './hapi';
import { honoIntegration } from './hono';
import { koaIntegration } from './koa';
import type { Integration } from '@sentry/core';
import { awsIntegration } from './aws-sdk';

/** These are integrations that are tracing-only integrations. */
export function getTracingIntegrations(): Integration[] {
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
    knexIntegration(),
    genericPoolIntegration(),
    kafkaIntegration(),
    amqplibIntegration(),
    lruMemoizerIntegration(),
    dataloaderIntegration(),
    awsIntegration(),
    // AI providers
    // LangChain must come first to disable AI provider integrations before they instrument
    langChainIntegration(),
    langGraphIntegration(),
    mastraIntegration(),
    vercelAIIntegration(),
    openAIIntegration(),
    anthropicAIIntegration(),
    googleGenAIIntegration(),
    mistralAIIntegration(),
    groqIntegration(),
    togetherAIIntegration(),
    typesafeIntegration(),
    postgresJsIntegration(),
    firebaseIntegration(),
    mcpServerIntegration(),
    nitroIntegration(),
  ];
}

/**
 * These are default integrations that are registered regardless of whether tracing is enabled -
 * either because they cover error capture in addition to tracing, or because they only handle trace
 * propagation (which must work in tracing-without-performance mode too).
 */
export function getErrorIntegrations(): Integration[] {
  return [
    expressIntegration(),
    fastifyIntegration(),
    hapiIntegration(),
    honoIntegration(),
    koaIntegration(),
    nitroServerTimingIntegration(),
  ];
}
