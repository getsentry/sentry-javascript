import type { InstrumentationConfig } from '../apmTypes';

import { uniq } from '@sentry/core';

import { awsSdkConfig } from './aws-sdk';
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
import { koaConfig } from './koa';
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
 *
 * This module MUST stay pure, stateless data. It is loaded in more than one realm
 * at once — the build-time bundler plugin inlines it into the server chunk, while
 * `@sentry/server-runtime-injection`'s external `register` loads its own copy from
 * `node_modules` at runtime. Two identical, side-effect-free arrays are harmless;
 * any module-level mutable state here would silently diverge between those copies.
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
  ...redisConfig,
  ...remixConfig,
  ...tediousConfig,
  ...vercelAiConfig,
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
  return [
    ...uniq([...SENTRY_INSTRUMENTATIONS, ...instrumentations].map(i => i.module.name)),
    // Additional things that need to be bundled but are not covered by the above
    // Remix needs to bundle this so @remix-run/server-runtime is _also_ bundled
    '@remix-run/node',
  ];
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

// This is exported so that the nestjs package can use it to subscribe to the channels.
export { nestjsChannels } from './nestjs';
// This is exported so that the remix package can use it to subscribe to the channels.
export { remixChannels } from './remix';
