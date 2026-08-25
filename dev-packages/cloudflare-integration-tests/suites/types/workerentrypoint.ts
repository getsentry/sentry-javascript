/**
 * Type tests for `withSentry` with `WorkerEntrypoint` class handlers.
 *
 * The env of the options callback must be inferred from the class — via its
 * `WorkerEntrypoint<Env>` base or an explicit constructor — and never collapse
 * to `unknown`.
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import { withSentry } from '@sentry/cloudflare';
import { expectTypeOf } from 'vitest';

interface EntrypointEnv {
  SENTRY_DSN: string;
}

// ---------------------------------------------------------------------------
// 1. Env inferred from the `WorkerEntrypoint<Env>` base class
// ---------------------------------------------------------------------------
class MyEntrypoint extends WorkerEntrypoint<EntrypointEnv> {
  override async fetch(request: Request): Promise<Response> {
    return new Response(request.url);
  }
}

export const entrypoint = withSentry(env => {
  expectTypeOf(env).toEqualTypeOf<EntrypointEnv>();
  return { dsn: env.SENTRY_DSN };
}, MyEntrypoint);

// The instrumented class keeps its type (constructor + instance shape).
const _entrypointClass: typeof MyEntrypoint = entrypoint;

// ---------------------------------------------------------------------------
// 2. WorkerEntrypoint<Env, Props>
// ---------------------------------------------------------------------------
interface EntrypointProps {
  name: string;
}

class MyEntrypointWithProps extends WorkerEntrypoint<EntrypointEnv, EntrypointProps> {}

export const entrypointWithProps = withSentry(env => {
  expectTypeOf(env).toEqualTypeOf<EntrypointEnv>();
  return { dsn: env.SENTRY_DSN };
}, MyEntrypointWithProps);

// ---------------------------------------------------------------------------
// 3. Explicit constructor with env annotation, bare base class
// ---------------------------------------------------------------------------
class MyEntrypointCustomCtor extends WorkerEntrypoint {
  constructor(ctx: ExecutionContext, env: EntrypointEnv) {
    super(ctx, env);
  }
}

export const entrypointCustomCtor = withSentry(env => {
  expectTypeOf(env).toEqualTypeOf<EntrypointEnv>();
  return { dsn: env.SENTRY_DSN };
}, MyEntrypointCustomCtor);

// ---------------------------------------------------------------------------
// 4. Bare `WorkerEntrypoint` without typegen — env must not error (any fallback)
// ---------------------------------------------------------------------------
class MyBareEntrypoint extends WorkerEntrypoint {}

export const bareEntrypoint = withSentry(env => {
  expectTypeOf(env).toBeAny();
  return { dsn: env.SENTRY_DSN };
}, MyBareEntrypoint);

// ---------------------------------------------------------------------------
// 5. Explicit generic with a class handler
// ---------------------------------------------------------------------------
export const entrypointExplicit = withSentry<EntrypointEnv>(env => {
  expectTypeOf(env).toEqualTypeOf<EntrypointEnv>();
  return { dsn: env.SENTRY_DSN };
}, MyEntrypoint);
