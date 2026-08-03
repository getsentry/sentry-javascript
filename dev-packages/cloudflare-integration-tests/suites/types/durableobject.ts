/**
 * Type tests for `instrumentDurableObjectWithSentry`.
 *
 * The env of the options callback must be inferred from the Durable Object class —
 * via its `DurableObject<Env>` base or an explicit constructor — and never collapse
 * to `unknown`.
 */
import { DurableObject } from 'cloudflare:workers';
import { instrumentDurableObjectWithSentry } from '@sentry/cloudflare';
import { expectTypeOf } from 'vitest';

interface DoEnv {
  SENTRY_DSN: string;
  MY_DO: DurableObjectNamespace;
}

// ---------------------------------------------------------------------------
// 1. Env inferred from the `DurableObject<Env>` base class
// ---------------------------------------------------------------------------
class MyDurableObject extends DurableObject<DoEnv> {
  async fetch(request: Request): Promise<Response> {
    return new Response(request.url);
  }
}

export const instrumentedDo = instrumentDurableObjectWithSentry(env => {
  expectTypeOf(env).toEqualTypeOf<DoEnv>();
  return { dsn: env.SENTRY_DSN };
}, MyDurableObject);

// The instrumented class keeps its type, including RPC methods and the namespace typing.
const _doClass: typeof MyDurableObject = instrumentedDo;

// ---------------------------------------------------------------------------
// 2. Explicit constructor with env annotation, bare base class
// ---------------------------------------------------------------------------
class MyDurableObjectCustomCtor extends DurableObject {
  constructor(ctx: DurableObjectState, env: DoEnv) {
    super(ctx, env);
  }
}

export const instrumentedDoCustomCtor = instrumentDurableObjectWithSentry(env => {
  expectTypeOf(env).toEqualTypeOf<DoEnv>();
  return { dsn: env.SENTRY_DSN };
}, MyDurableObjectCustomCtor);

// ---------------------------------------------------------------------------
// 3. Explicit generic
// ---------------------------------------------------------------------------
export const instrumentedDoExplicit = instrumentDurableObjectWithSentry<DoEnv>(env => {
  expectTypeOf(env).toEqualTypeOf<DoEnv>();
  return { dsn: env.SENTRY_DSN };
}, MyDurableObject);

// ---------------------------------------------------------------------------
// 4. DurableObject<Env, Props>
// ---------------------------------------------------------------------------
interface DoProps {
  shard: string;
}

class MyDurableObjectWithProps extends DurableObject<DoEnv, DoProps> {}

export const instrumentedDoWithProps = instrumentDurableObjectWithSentry(env => {
  expectTypeOf(env).toEqualTypeOf<DoEnv>();
  return { dsn: env.SENTRY_DSN };
}, MyDurableObjectWithProps);
