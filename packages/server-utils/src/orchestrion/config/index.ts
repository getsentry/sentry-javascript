import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';
import { uniq } from '@sentry/core';
import { mysqlConfig } from './mysql';
import { lruMemoizerConfig } from './lru-memoizer';
import { ioredisConfig } from './ioredis';
import { openaiConfig } from './openai';
import { pgConfig } from './pg';
import { postgresJsConfig } from './postgres';
import { anthropicAiConfig } from './anthropic-ai';
import { googleGenAiConfig } from './google-genai';
import { vercelAiConfig } from './vercel-ai';
import { amqplibConfig } from './amqplib';
import { hapiConfig } from './hapi';
import { redisConfig } from './redis';
import { expressConfig } from './express';
import { graphqlConfig } from './graphql';
import { kafkajsConfig } from './kafkajs';

export const SENTRY_INSTRUMENTATIONS: InstrumentationConfig[] = [
  ...mysqlConfig,
  ...lruMemoizerConfig,
  ...ioredisConfig,
  ...openaiConfig,
  ...pgConfig,
  ...postgresJsConfig,
  ...anthropicAiConfig,
  ...googleGenAiConfig,
  ...vercelAiConfig,
  ...hapiConfig,
  ...amqplibConfig,
  ...redisConfig,
  ...expressConfig,
  ...graphqlConfig,
  ...kafkajsConfig,
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
