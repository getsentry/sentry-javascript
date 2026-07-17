import type { InstrumentationConfig } from '..';
import { uniq } from '@sentry/core';

import { awsSdkConfig, awsSdkSubscribeInjection } from './aws-sdk';
import { amqplibConfig, amqplibSubscribeInjection } from './amqplib';
import { anthropicAiConfig, anthropicAiSubscribeInjection } from './anthropic-ai';
import { dataloaderConfig, dataloaderSubscribeInjection } from './dataloader';
import { expressConfig, expressSubscribeInjection } from './express';
import { firebaseConfig } from './firebase';
import { genericPoolConfig, genericPoolSubscribeInjection } from './generic-pool';
import { googleGenAiConfig, googleGenAiSubscribeInjection } from './google-genai';
import { graphqlConfig, graphqlSubscribeInjection } from './graphql';
import { hapiConfig, hapiSubscribeInjection } from './hapi';
import { ioredisConfig, ioredisSubscribeInjection } from './ioredis';
import { kafkajsConfig, kafkajsSubscribeInjection } from './kafkajs';
import { knexConfig } from './knex';
import { koaConfig } from './koa';
import { langchainConfig } from './langchain';
import { langgraphConfig } from './langgraph';
import { lruMemoizerConfig, lruMemoizerSubscribeInjection } from './lru-memoizer';
import { mongodbConfig } from './mongodb';
import { mongooseConfig } from './mongoose';
import { mysql2Config, mysql2SubscribeInjection } from './mysql2';
import { mysqlConfig, mysqlSubscribeInjection } from './mysql';
import { nestjsConfig } from './nestjs';
import { openaiConfig, openaiSubscribeInjection } from './openai';
import { pgConfig, pgSubscribeInjection } from './pg';
import { postgresJsConfig, postgresJsSubscribeInjection } from './postgres';
import { prismaConfig } from './prisma';
import { reactRouterConfig } from './react-router';
import { redisConfig, redisSubscribeInjection } from './redis';
import { remixConfig } from './remix';
import { tediousConfig } from './tedious';
import { vercelAiConfig, vercelAiSubscribeInjection } from './vercel-ai';
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
  ...awsSdkConfig,
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
  ...koaConfig,
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
 * The `Program`-matching injection configs that make each instrumented file
 * self-register its channel subscriber at load (used by bundler-only SDKs like
 * `@sentry/cloudflare`).
 *
 * Deliberately separate from `SENTRY_INSTRUMENTATIONS`: these reference a custom
 * transform that only the opted-in bundler plugin registers, so feeding them to
 * the runtime `--import` hook (which can't register it) would make the
 * code-transformer drop the whole file. Each library owns its own
 * `*SubscribeInjection` (derived from its channel configs), collected here.
 */
export const SUBSCRIBE_INJECTIONS: InstrumentationConfig[] = [
  ...amqplibSubscribeInjection,
  ...anthropicAiSubscribeInjection,
  ...awsSdkSubscribeInjection,
  ...dataloaderSubscribeInjection,
  ...expressSubscribeInjection,
  ...genericPoolSubscribeInjection,
  ...googleGenAiSubscribeInjection,
  ...graphqlSubscribeInjection,
  ...hapiSubscribeInjection,
  ...ioredisSubscribeInjection,
  ...kafkajsSubscribeInjection,
  ...lruMemoizerSubscribeInjection,
  ...mysql2SubscribeInjection,
  ...mysqlSubscribeInjection,
  ...openaiSubscribeInjection,
  ...pgSubscribeInjection,
  ...postgresJsSubscribeInjection,
  ...redisSubscribeInjection,
  ...vercelAiSubscribeInjection,
];

/**
 * The unique set of package names instrumented by `SENTRY_INSTRUMENTATIONS`
 * merged with any caller-provided `instrumentations` (e.g. `['mysql']`).
 *
 * Bundler plugins MUST ensure these are actually bundled rather than
 * externalized: an externalized dependency is resolved from `node_modules` at
 * runtime and never passes through the code transform's `onLoad`, so its
 * diagnostics_channel calls are silently never injected. This includes a
 * plugin's custom `instrumentations`, otherwise those extra packages can stay
 * externalized and their transform never runs.
 */
export function instrumentedModuleNames(instrumentations: InstrumentationConfig[] = []): string[] {
  return uniq([...SENTRY_INSTRUMENTATIONS, ...instrumentations].map(i => i.module.name));
}

/** The instrumented module names from the default Sentry config, with no custom additions. */
export const INSTRUMENTED_MODULE_NAMES: string[] = instrumentedModuleNames();

/**
 * Returns `external` with any instrumented packages removed, so a bundler that
 * uses an "external" denylist (esbuild, Bun, Rollup) still bundles — and thus
 * transforms — them. Matches an exact package name (`'mysql'`) or a subpath
 * (`'mysql/lib/...'`); wildcard/other patterns are left untouched. `undefined`
 * is returned unchanged.
 *
 * Pass `moduleNames` from `instrumentedModuleNames(options.instrumentations)` so
 * custom instrumentations are stripped too; it defaults to the Sentry config
 * list. (Vite uses an `ssr.noExternal` allowlist instead, so it consumes
 * `instrumentedModuleNames` directly rather than this helper.)
 */
export function withoutInstrumentedExternals(
  external: readonly string[] | undefined,
  moduleNames: string[] = INSTRUMENTED_MODULE_NAMES,
): string[] | undefined {
  if (!external) {
    return undefined;
  }
  return external.filter(entry => !moduleNames.some(name => entry === name || entry.startsWith(`${name}/`)));
}
