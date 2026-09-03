import { amqplibIntegration } from './amqplib';
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
import { vercelAIIntegration } from './vercel-ai';
import { openAIIntegration } from './openai';
import { anthropicAIIntegration } from './anthropic';
import { googleGenAIIntegration } from './google-genai';
import { postgresJsIntegration } from './postgres-js';
import { firebaseIntegration } from './firebase';
import { expressIntegration } from './express';
import { fastifyIntegration } from './fastify';
import { hapiIntegration } from './hapi';
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
    genericPoolIntegration(),
    kafkaIntegration(),
    amqplibIntegration(),
    lruMemoizerIntegration(),
    awsIntegration(),
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

/** These are integrations that cover error capture, in addition to tracing. */
export function getErrorIntegrations(): Integration[] {
  return [expressIntegration(), fastifyIntegration(), hapiIntegration(), koaIntegration()];
}
