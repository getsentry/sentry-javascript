/**
 * Type tests for the wrangler-generated (`wrangler types`) setup.
 *
 * This folder is a separate tsc program (see `./tsconfig.json`) so that the global
 * `Cloudflare.Env` augmentation below simulates a project that ran `wrangler types`,
 * without affecting the other suites: in the main program `Cloudflare.Env` stays the
 * empty interface.
 */
import { DurableObject, WorkerEntrypoint, WorkflowEntrypoint } from 'cloudflare:workers';
import { instrumentDurableObjectWithSentry, instrumentWorkflowWithSentry, withSentry } from '@sentry/cloudflare';
import { expectTypeOf } from 'vitest';

// Simulates `wrangler types` output.
declare global {
  namespace Cloudflare {
    interface Env {
      SENTRY_DSN: string;
      MY_KV: KVNamespace;
    }
  }
}

// ---------------------------------------------------------------------------
// Bare handler, no annotations: env picks up the generated `Cloudflare.Env`
// ---------------------------------------------------------------------------
export const typegen = withSentry(
  env => {
    expectTypeOf(env).toEqualTypeOf<Cloudflare.Env>();
    return { dsn: env.SENTRY_DSN };
  },
  {
    async fetch(request, env) {
      expectTypeOf(env).toEqualTypeOf<Cloudflare.Env>();
      void env.MY_KV;
      return new Response(request.url);
    },
  },
);

// ---------------------------------------------------------------------------
// Bare Durable Object (no generic): env picks up the generated `Cloudflare.Env`
// ---------------------------------------------------------------------------
class MyDurableObject extends DurableObject {}

export const instrumentedDo = instrumentDurableObjectWithSentry(env => {
  expectTypeOf(env).toEqualTypeOf<Cloudflare.Env>();
  return { dsn: env.SENTRY_DSN };
}, MyDurableObject);

// ---------------------------------------------------------------------------
// Bare WorkerEntrypoint / WorkflowEntrypoint (no generic), the setup Cloudflare
// recommends: env picks up the generated `Cloudflare.Env`
// ---------------------------------------------------------------------------
class MyEntrypoint extends WorkerEntrypoint {}

export const entrypoint = withSentry(env => {
  expectTypeOf(env).toEqualTypeOf<Cloudflare.Env>();
  return { dsn: env.SENTRY_DSN };
}, MyEntrypoint);

class MyWorkflow extends WorkflowEntrypoint {}

export const workflow = instrumentWorkflowWithSentry(env => {
  expectTypeOf(env).toEqualTypeOf<Cloudflare.Env>();
  return { dsn: env.SENTRY_DSN };
}, MyWorkflow);

// ---------------------------------------------------------------------------
// Framework-wrapped handlers without their own env type (TanStack's
// `ServerEntry`): env picks up the generated `Cloudflare.Env`
// ---------------------------------------------------------------------------
type ServerEntry = {
  fetch: (request: Request, opts?: unknown) => Promise<Response> | Response;
};

declare const serverEntry: ServerEntry;

export const tanstack = withSentry(env => {
  expectTypeOf(env).toEqualTypeOf<Cloudflare.Env>();
  return { dsn: env.SENTRY_DSN };
}, serverEntry);
