/**
 * Type tests for `withSentry` with `ExportedHandler` (object) handlers.
 *
 * Regression coverage for https://github.com/getsentry/sentry-javascript/issues/18294:
 * the `env` of the options callback must be inferred from the passed handler wherever
 * possible, fall back to the explicit `Env` generic / wrangler-generated `Cloudflare.Env`,
 * and never collapse to `unknown` (which breaks compilation).
 *
 * NOTE: This tsc program intentionally has no `Cloudflare.Env` augmentation — the
 * wrangler-generated scenario lives in `suites/types/typegen/` (separate tsconfig).
 */
import { Hono } from 'hono';
import { withSentry } from '@sentry/cloudflare';
import { expectTypeOf } from 'vitest';

// ---------------------------------------------------------------------------
// 1. The issue reproduction: manual (exported) Env interface + `satisfies`
// ---------------------------------------------------------------------------
interface ManualEnv {
  SENTRY_DATA_SOURCE_NAME: string;
}

export const reproduction = withSentry(
  env => {
    expectTypeOf(env).toEqualTypeOf<ManualEnv>();
    return { dsn: env.SENTRY_DATA_SOURCE_NAME };
  },
  {
    fetch(_, env) {
      expectTypeOf(env).toEqualTypeOf<ManualEnv>();
      return Response.json({ env }, { status: 200 });
    },
  } satisfies ExportedHandler<ManualEnv>,
);

// The wrapped handler stays assignable to the user's handler type.
const _reproductionHandler: ExportedHandler<ManualEnv> = reproduction;

// ---------------------------------------------------------------------------
// 2. Pre-typed handler constant — env inferred from the declared handler type
// ---------------------------------------------------------------------------
interface PretypedEnv {
  MY_KV: KVNamespace;
}

const pretypedHandler: ExportedHandler<PretypedEnv> = {
  async fetch(_, env) {
    await env.MY_KV.get('key');
    return new Response('ok');
  },
};

export const pretyped = withSentry(env => {
  expectTypeOf(env).toEqualTypeOf<PretypedEnv>();
  void env.MY_KV;
  return { dsn: 'https://public@dsn.ingest.sentry.io/1337' };
}, pretypedHandler);

// An annotated callback pins the env independent of the handler.
export const annotatedCallback = withSentry((env: PretypedEnv) => {
  expectTypeOf(env).toEqualTypeOf<PretypedEnv>();
  void env.MY_KV;
  return { dsn: 'https://public@dsn.ingest.sentry.io/1337' };
}, pretypedHandler);

// ...including with a bare handler literal (the most common setup in the suites).
export const annotatedCallbackBareHandler = withSentry((_: PretypedEnv) => ({}), {
  async fetch(_, env) {
    expectTypeOf(env).toEqualTypeOf<PretypedEnv>();
    void env.MY_KV;
    return new Response('ok');
  },
});

// ---------------------------------------------------------------------------
// 3. Bare handler, no annotations, no `wrangler types` — env must not error
//    (falls back to `any`; with typegen it would be `Cloudflare.Env`, see typegen/)
// ---------------------------------------------------------------------------
export const bare = withSentry(
  env => {
    expectTypeOf(env).toBeAny();
    // Unknown bindings must not fail compilation when no types were generated.
    return { dsn: env.SENTRY_DSN };
  },
  {
    async fetch(request, env, ctx) {
      ctx.waitUntil(Promise.resolve());
      return new Response(request.url);
    },
  },
);

// ---------------------------------------------------------------------------
// 4. Explicit `withSentry<Env>(...)` — with satisfies-typed and bare handlers
// ---------------------------------------------------------------------------
interface ExplicitEnv {
  SENTRY_DSN: string;
}

export const explicitGeneric = withSentry<ExplicitEnv>(
  env => {
    expectTypeOf(env).toEqualTypeOf<ExplicitEnv>();
    return { dsn: env.SENTRY_DSN };
  },
  {
    fetch(_, env) {
      expectTypeOf(env).toEqualTypeOf<ExplicitEnv>();
      void env.SENTRY_DSN;
      return new Response('ok');
    },
  } satisfies ExportedHandler<ExplicitEnv>,
);

export const explicitGenericBareHandler = withSentry<ExplicitEnv>(
  env => {
    expectTypeOf(env).toEqualTypeOf<ExplicitEnv>();
    return { dsn: env.SENTRY_DSN };
  },
  {
    fetch(_, env) {
      expectTypeOf(env).toEqualTypeOf<ExplicitEnv>();
      void env.SENTRY_DSN;
      return new Response('ok');
    },
  },
);

// ---------------------------------------------------------------------------
// 5. Fully explicit `withSentry<Env, QueueHandlerMessage, CfHostMetadata>`
// ---------------------------------------------------------------------------
interface QueueMessage {
  userId: string;
}
interface CfMetadata {
  country: string;
}

export const fullyExplicit = withSentry<ExplicitEnv, QueueMessage, CfMetadata>(
  env => {
    expectTypeOf(env).toEqualTypeOf<ExplicitEnv>();
    return { dsn: env.SENTRY_DSN };
  },
  {
    async queue(batch) {
      expectTypeOf(batch).toEqualTypeOf<MessageBatch<QueueMessage>>();
      void batch.messages[0]?.body.userId;
    },
  },
);

// ---------------------------------------------------------------------------
// 6. env is inferred from non-fetch handler methods too (scheduled, queue, ...)
// ---------------------------------------------------------------------------
interface CronEnv {
  SENTRY_DSN: string;
}

export const scheduledOnly = withSentry(
  env => {
    expectTypeOf(env).toEqualTypeOf<CronEnv>();
    return { dsn: env.SENTRY_DSN };
  },
  {
    scheduled(_, env) {
      expectTypeOf(env).toEqualTypeOf<CronEnv>();
      void env.SENTRY_DSN;
    },
  } satisfies ExportedHandler<CronEnv>,
);

export const queueOnly = withSentry(
  env => {
    expectTypeOf(env).toEqualTypeOf<CronEnv>();
    return { dsn: env.SENTRY_DSN };
  },
  {
    queue(_, env) {
      expectTypeOf(env).toEqualTypeOf<CronEnv>();
      void env.SENTRY_DSN;
    },
  } satisfies ExportedHandler<CronEnv>,
);

export const tailOnly = withSentry(
  env => {
    expectTypeOf(env).toEqualTypeOf<CronEnv>();
    return { dsn: env.SENTRY_DSN };
  },
  {
    tail(_, env) {
      expectTypeOf(env).toEqualTypeOf<CronEnv>();
      void env.SENTRY_DSN;
    },
  } satisfies ExportedHandler<CronEnv>,
);

export const emailOnly = withSentry(
  env => {
    expectTypeOf(env).toEqualTypeOf<CronEnv>();
    return { dsn: env.SENTRY_DSN };
  },
  {
    email(_, env) {
      expectTypeOf(env).toEqualTypeOf<CronEnv>();
      void env.SENTRY_DSN;
    },
  } satisfies ExportedHandler<CronEnv>,
);

// A handler with several methods still infers one consistent env.
export const mixedMethods = withSentry(
  env => {
    expectTypeOf(env).toEqualTypeOf<CronEnv>();
    return { dsn: env.SENTRY_DSN };
  },
  {
    fetch(_, env) {
      expectTypeOf(env).toEqualTypeOf<CronEnv>();
      void env.SENTRY_DSN;
      return new Response('ok');
    },
    async queue(_, env) {
      expectTypeOf(env).toEqualTypeOf<CronEnv>();
      void env.SENTRY_DSN;
    },
    async scheduled(_, env) {
      expectTypeOf(env).toEqualTypeOf<CronEnv>();
      void env.SENTRY_DSN;
    },
  } satisfies ExportedHandler<CronEnv>,
);

// The options callback may also return `undefined`.
export const undefinedOptions = withSentry(() => undefined, {
  async fetch() {
    return new Response('ok');
  },
});

// ---------------------------------------------------------------------------
// 7. Hono apps: `Bindings` is inferred as the callback env and members beyond
//    `fetch` survive the wrapping
// ---------------------------------------------------------------------------
interface HonoEnv {
  SENTRY_DSN: string;
}

const realHonoApp = new Hono<{ Bindings: HonoEnv }>();

export const realHono = withSentry(env => {
  expectTypeOf(env).toEqualTypeOf<HonoEnv>();
  return { dsn: env.SENTRY_DSN };
}, realHonoApp);

// Members beyond `fetch` survive the wrapping.
realHono.onError(err => new Response(`Error: ${err.message}`, { status: 500 }));

// Hono apps using `Variables` (context state) still infer `Bindings` as the env.
interface HonoVariables {
  user: string;
}

const realHonoAppWithVariables = new Hono<{ Bindings: HonoEnv; Variables: HonoVariables }>();

export const realHonoWithVariables = withSentry(env => {
  expectTypeOf(env).toEqualTypeOf<HonoEnv>();
  return { dsn: env.SENTRY_DSN };
}, realHonoAppWithVariables);

// Hono with an annotated callback and with an explicit generic.
export const realHonoAnnotated = withSentry((env: HonoEnv) => {
  expectTypeOf(env).toEqualTypeOf<HonoEnv>();
  return { dsn: env.SENTRY_DSN };
}, realHonoApp);

export const realHonoExplicit = withSentry<HonoEnv>(env => {
  expectTypeOf(env).toEqualTypeOf<HonoEnv>();
  return { dsn: env.SENTRY_DSN };
}, realHonoApp);

// ---------------------------------------------------------------------------
// 8. TanStack-style wrapped handlers (`ServerEntry` carries no env type):
//    an annotated callback or an explicit generic pins the env; unannotated
//    falls back to `any` here / `Cloudflare.Env` with typegen (see typegen/)
// ---------------------------------------------------------------------------
type ServerEntry = {
  fetch: (request: Request, opts?: unknown) => Promise<Response> | Response;
};

declare const tanstackHandler: ServerEntry;

export const tanstack = withSentry((env: ManualEnv) => {
  expectTypeOf(env).toEqualTypeOf<ManualEnv>();
  return { dsn: env.SENTRY_DATA_SOURCE_NAME };
}, tanstackHandler);

export const tanstackExplicit = withSentry<ManualEnv>(env => {
  expectTypeOf(env).toEqualTypeOf<ManualEnv>();
  return { dsn: env.SENTRY_DATA_SOURCE_NAME };
}, tanstackHandler);

export const tanstackBare = withSentry(env => {
  expectTypeOf(env).toBeAny();
  return { dsn: env.SENTRY_DATA_SOURCE_NAME };
}, tanstackHandler);

// ---------------------------------------------------------------------------
// 9. Inferred envs are exact: the `expectTypeOf(env).toEqualTypeOf<X>()`
//    assertions above only hold for the precise interface — never for `any`,
//    `unknown`, or a wider type — so a silent fallback cannot sneak back in.
// ---------------------------------------------------------------------------
