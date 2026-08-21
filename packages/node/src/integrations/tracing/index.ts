import type { Integration } from '@sentry/core';
import { prismaIntegration } from '@sentry/server-utils';
import {
  amqplibIntegration,
  anthropicAIIntegration,
  expressIntegration,
  firebaseIntegration,
  genericPoolIntegration,
  googleGenAIIntegration,
  graphqlIntegration,
  hapiIntegration,
  kafkaIntegration,
  koaIntegration,
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
} from '@sentry/server-utils/orchestrion';
import { fastifyIntegration } from './fastify';

/**
 * This explicitly has no return type to ensure this is inferred properly.
 * We use this to ensure that AUTO_PERFORMANCE_INTEGRATION_NAMES is in sync with the integrations returned by this function.
 */
function _getAutoPerformanceIntegrations() {
  return [
    expressIntegration(),
    fastifyIntegration(),
    graphqlIntegration(),
    mongoIntegration(),
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

export function getAutoPerformanceIntegrations(): Integration[] {
  return _getAutoPerformanceIntegrations();
}

/**
 * Union of the `name` of every integration returned by {@link _getAutoPerformanceIntegrations}.
 * Derived from that function's inferred (intentionally un-annotated) return type, so it stays in
 * sync automatically as integrations are added or removed.
 */
type AutoPerformanceIntegrationName = ReturnType<typeof _getAutoPerformanceIntegrations>[number]['name'];

/**
 * Builds a readonly tuple that must list **every** member of `T` exactly. A missing member makes the
 * call fail to compile — the error names the missing member(s) — while an unknown/misspelled member
 * is rejected by the element constraint. This enforces exhaustiveness at the declaration itself, so
 * no separate assertion is needed.
 */
const tupleOfAllNames =
  <T extends string>() =>
  <const U extends readonly T[]>(names: [T] extends [U[number]] ? U : Exclude<T, U[number]>): U =>
    names as U;

/**
 * The names of all auto performance integrations, as a runtime constant so callers can check for
 * these integrations (e.g. to gate channel-based instrumentation) without instantiating them. Typed
 * so that adding an integration to {@link _getAutoPerformanceIntegrations} without listing it here
 * (or vice versa) is a compile error.
 */
export const AUTO_PERFORMANCE_INTEGRATION_NAMES = tupleOfAllNames<AutoPerformanceIntegrationName>()([
  'Express',
  'Fastify',
  'Graphql',
  'Mongo',
  'Mongoose',
  'Mysql',
  'Mysql2',
  'Redis',
  'Postgres',
  'Prisma',
  'Hapi',
  'Koa',
  'Tedious',
  'GenericPool',
  'Kafka',
  'Amqplib',
  'LruMemoizer',
  'LangChain',
  'LangGraph',
  'VercelAI',
  'OpenAI',
  'Anthropic_AI',
  'Google_GenAI',
  'PostgresJs',
  'Firebase',
]);
