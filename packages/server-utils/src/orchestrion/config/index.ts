import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';
import { uniq } from '@sentry/core';

import { amqplibConfig } from './amqplib';
import { anthropicAiConfig } from './anthropic-ai';
import { dataloaderConfig } from './dataloader';
import { expressConfig } from './express';
import { firebaseConfig } from './firebase';
import { genericPoolConfig } from './generic-pool';
import { googleGenAiConfig } from './google-genai';
import { graphqlConfig } from './graphql';
import { hapiConfig } from './hapi';
import { ioredisConfig } from './ioredis';
import { kafkajsConfig } from './kafkajs';
import { knexConfig } from './knex';
import { langchainConfig } from './langchain';
import { langgraphConfig } from './langgraph';
import { lruMemoizerConfig } from './lru-memoizer';
import { mongodbConfig } from './mongodb';
import { mongooseConfig } from './mongoose';
import { mysql2Config } from './mysql2';
import { mysqlConfig } from './mysql';
import { nestjsConfig } from './nestjs';
import { openaiConfig } from './openai';
import { pgConfig } from './pg';
import { postgresJsConfig } from './postgres';
import { prismaConfig } from './prisma';
import { reactRouterConfig } from './react-router';
import { redisConfig } from './redis';
import { remixConfig } from './remix';
import { tediousConfig } from './tedious';
import { vercelAiConfig } from './vercel-ai';
// Kept sorted alphabetically by module so concurrent additions insert at different
// points rather than all appending to the end (fewer merge conflicts).

/**
 * The orchestrion code-transform configs. Every instrumentable library is here
 * so the transform is all-or-nothing: whenever orchestrion is enabled, all of
 * these are injected. The channel LISTENERS may live elsewhere (e.g. the NestJS
 * one lives in `@sentry/nestjs`), but the config that decides what gets
 * transformed is centralized here.
 */
export const SENTRY_INSTRUMENTATIONS: InstrumentationConfig[] = [
  ...amqplibConfig,
  ...anthropicAiConfig,
  ...dataloaderConfig,
  ...expressConfig,
  ...firebaseConfig,
  ...genericPoolConfig,
  ...googleGenAiConfig,
  ...graphqlConfig,
  ...hapiConfig,
  ...ioredisConfig,
  ...kafkajsConfig,
  ...knexConfig,
  ...langchainConfig,
  ...langgraphConfig,
  ...lruMemoizerConfig,
  ...mongodbConfig,
  ...mongooseConfig,
  ...mysql2Config,
  ...mysqlConfig,
  ...nestjsConfig,
  ...openaiConfig,
  ...pgConfig,
  ...postgresJsConfig,
  ...prismaConfig,
  ...reactRouterConfig,
  ...redisConfig,
  ...remixConfig,
  ...tediousConfig,
  ...vercelAiConfig,
];

/**
 * The unique set of package names instrumented by `SENTRY_INSTRUMENTATIONS`
 * (e.g. `['mysql']`).
 *
 * Bundler plugins MUST ensure these are actually bundled rather than
 * externalized: an externalized dependency is resolved from `node_modules` at
 * runtime and never passes through the code transform's `onLoad`, so its
 * diagnostics_channel calls are silently never injected.
 */
export const INSTRUMENTED_MODULE_NAMES: string[] = uniq(SENTRY_INSTRUMENTATIONS.map(i => i.module.name));

/**
 * Returns `external` with any instrumented packages removed, so a bundler that
 * uses an "external" denylist (esbuild, Bun, Rollup) still bundles — and thus
 * transforms — them. Matches an exact package name (`'mysql'`) or a subpath
 * (`'mysql/lib/...'`); wildcard/other patterns are left untouched. `undefined`
 * is returned unchanged.
 *
 * (Vite uses an `ssr.noExternal` allowlist instead, so it consumes
 * `INSTRUMENTED_MODULE_NAMES` directly rather than this helper.)
 */
export function withoutInstrumentedExternals(external: readonly string[] | undefined): string[] | undefined {
  if (!external) {
    return undefined;
  }
  return external.filter(
    entry => !INSTRUMENTED_MODULE_NAMES.some(name => entry === name || entry.startsWith(`${name}/`)),
  );
}
