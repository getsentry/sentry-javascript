/**
 * Type tests for `sentryPagesPlugin` and `defineCloudflareOptions`.
 */
import { defineCloudflareOptions, sentryPagesPlugin } from '@sentry/cloudflare';
import { expectTypeOf } from 'vitest';

interface PagesEnv {
  SENTRY_DSN: string;
}

// ---------------------------------------------------------------------------
// sentryPagesPlugin: explicit Env is typed, the default does not error
// ---------------------------------------------------------------------------
export const pagesPluginExplicit = sentryPagesPlugin<PagesEnv>(context => {
  // `env` is `PagesEnv & { ASSETS: ... }` — the workers-types Pages intersection.
  expectTypeOf(context.env.SENTRY_DSN).toEqualTypeOf<string>();
  return { dsn: context.env.SENTRY_DSN };
});

export const pagesPluginDefault = sentryPagesPlugin(context => {
  // No explicit generic: env access must not fail compilation.
  return { dsn: context.env.SENTRY_DSN };
});

// ---------------------------------------------------------------------------
// defineCloudflareOptions: explicit Env is typed, the default does not error
// ---------------------------------------------------------------------------
interface OptionsEnv {
  SENTRY_DSN: string;
}

export const optionsExplicit = defineCloudflareOptions<OptionsEnv>(env => {
  expectTypeOf(env).toEqualTypeOf<OptionsEnv>();
  return { dsn: env.SENTRY_DSN };
});

export const optionsDefault = defineCloudflareOptions(env => {
  expectTypeOf(env).toBeAny();
  return { dsn: env.SENTRY_DSN };
});

export const optionsStatic = defineCloudflareOptions({ tracesSampleRate: 1.0 });
