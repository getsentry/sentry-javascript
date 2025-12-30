import type { Integration } from '@sentry/core';
import { instrumentOtelHttp, instrumentSentryHttp } from '../http';
import { amqplibIntegration, instrumentAmqplib } from './amqplib';
import { anthropicAIIntegration, instrumentAnthropicAi } from './anthropic-ai';
import { connectIntegration, instrumentConnect } from './connect';
import { expressIntegration, instrumentExpress } from './express';
import { fastifyIntegration, instrumentFastify, instrumentFastifyV3 } from './fastify';
import { firebaseIntegration, instrumentFirebase } from './firebase';
import { genericPoolIntegration, instrumentGenericPool } from './genericPool';
import { googleGenAIIntegration, instrumentGoogleGenAI } from './google-genai';
import { graphqlIntegration, instrumentGraphql } from './graphql';
import { hapiIntegration, instrumentHapi } from './hapi';
import { honoIntegration, instrumentHono } from './hono';
import { instrumentKafka, kafkaIntegration } from './kafka';
import { instrumentKoa, koaIntegration } from './koa';
import { instrumentLangChain, langChainIntegration } from './langchain';
import { instrumentLangGraph, langGraphIntegration } from './langgraph';
import { instrumentLruMemoizer, lruMemoizerIntegration } from './lrumemoizer';
import { instrumentMongo, mongoIntegration } from './mongo';
import { instrumentMongoose, mongooseIntegration } from './mongoose';
import { instrumentMysql, mysqlIntegration } from './mysql';
import { instrumentMysql2, mysql2Integration } from './mysql2';
import { instrumentOpenAi, openAIIntegration } from './openai';
import { instrumentPostgres, postgresIntegration } from './postgres';
import { instrumentPostgresJs, postgresJsIntegration } from './postgresjs';
import { prismaIntegration } from './prisma';
import { instrumentRedis, redisIntegration } from './redis';
import { instrumentTedious, tediousIntegration } from './tedious';
import { instrumentVercelAi, vercelAIIntegration } from './vercelai';

/**
 * With OTEL, all performance integrations will be added, as OTEL only initializes them when the patched package is actually required.
 */
export function getAutoPerformanceIntegrations(): Integration[] {
  return [
    expressIntegration(),
    fastifyIntegration(),
    graphqlIntegration(),
    honoIntegration(),
    mongoIntegration(),
    mongooseIntegration(),
    mysqlIntegration(),
    mysql2Integration(),
    redisIntegration(),
    postgresIntegration(),
    prismaIntegration(),
    hapiIntegration(),
    koaIntegration(),
    connectIntegration(),
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
    instrumentOtelHttp,
    instrumentExpress,
    instrumentConnect,
    instrumentFastify,
    instrumentFastifyV3,
    instrumentHapi,
    instrumentHono,
    instrumentKafka,
    instrumentKoa,
    instrumentLruMemoizer,
    instrumentMongo,
    instrumentMongoose,
    instrumentMysql,
    instrumentMysql2,
    instrumentPostgres,
    instrumentHapi,
    instrumentGraphql,
    instrumentRedis,
    instrumentTedious,
    instrumentGenericPool,
    instrumentAmqplib,
    instrumentLangChain,
    instrumentVercelAi,
    instrumentOpenAi,
    instrumentPostgresJs,
    instrumentFirebase,
    instrumentAnthropicAi,
    instrumentGoogleGenAI,
    instrumentLangGraph,
  ];
}
