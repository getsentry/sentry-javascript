import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';
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
import { nestjsConfig } from './nestjs';

/**
 * The orchestrion code-transform configs. Every instrumentable library is here
 * so the transform is all-or-nothing: whenever orchestrion is enabled, all of
 * these are injected. The channel LISTENERS may live elsewhere,but the config
 * that decides what gets transformed is centralized here.
 */
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
  ...nestjsConfig,
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
export const INSTRUMENTED_MODULE_NAMES: string[] = Array.from(new Set(SENTRY_INSTRUMENTATIONS.map(i => i.module.name)));

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
