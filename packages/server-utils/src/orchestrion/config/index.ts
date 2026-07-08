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
import { getInjectedOrchestrionInstrumentations } from '../registry';

/**
 * The built-in orchestrion code-transform configs shipped by `@sentry/server-utils`.
 *
 * Framework packages that own their own instrumentation (e.g. `@sentry/nestjs`)
 * are NOT here — they inject via the registry (runtime) or the bundler plugin's
 * `instrumentations` option (build time). Use {@link getSentryInstrumentations}
 * to get the built-ins merged with any injected ones.
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
];

/**
 * The built-in configs merged with any externally-injected ones (see the
 * registry). This is the list the runtime hook feeds to the code transform.
 */
export function getSentryInstrumentations(): InstrumentationConfig[] {
  return [...SENTRY_INSTRUMENTATIONS, ...getInjectedOrchestrionInstrumentations().flatMap(i => i.configs)];
}

/** The unique set of instrumented package names for the given configs. */
export function instrumentedModuleNames(configs: InstrumentationConfig[]): string[] {
  return Array.from(new Set(configs.map(i => i.module.name)));
}

/**
 * The unique set of package names instrumented by the built-in
 * `SENTRY_INSTRUMENTATIONS` (e.g. `['mysql']`).
 *
 * Bundler plugins MUST ensure these are actually bundled rather than
 * externalized: an externalized dependency is resolved from `node_modules` at
 * runtime and never passes through the code transform's `onLoad`, so its
 * diagnostics_channel calls are silently never injected.
 */
export const INSTRUMENTED_MODULE_NAMES: string[] = instrumentedModuleNames(SENTRY_INSTRUMENTATIONS);

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
export function withoutInstrumentedExternals(
  external: readonly string[] | undefined,
  names: string[] = INSTRUMENTED_MODULE_NAMES,
): string[] | undefined {
  if (!external) {
    return undefined;
  }
  return external.filter(entry => !names.some(name => entry === name || entry.startsWith(`${name}/`)));
}
