import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  SCOPE_DO: DurableObjectNamespace;
}

class ScopeDurableObjectBase extends DurableObject<Env> {
  /**
   * `setTag`/`setUser` write to the isolation scope, which a Durable Object keeps across
   * invocations. Only the seeding invocation writes, so whatever a later invocation reports it
   * must have inherited from a scope the two shared.
   */
  async scopeCheck(seed: boolean): Promise<string> {
    if (seed) {
      Sentry.setTag('seeded_tag', 'from-seeding-invocation');
      Sentry.setUser({ id: 'user-from-seeding-invocation' });
    }

    Sentry.captureException(new Error(seed ? 'Scope seed' : 'Scope probe'));

    return 'ok';
  }

  /**
   * A direct method call on the same Durable Object is part of the calling invocation, so it
   * must see — and be able to extend — the same isolation scope. Only the outer method captures:
   * if the nested call ran in its own scope, the outer event would miss `inner_tag` and the user.
   */
  async nestedScopeCheck(): Promise<string> {
    Sentry.setTag('outer_tag', 'from-outer-method');

    await this.innerScopeHelper();

    Sentry.captureException(new Error('Nested outer'));

    return 'ok';
  }

  async innerScopeHelper(): Promise<void> {
    Sentry.setTag('inner_tag', 'from-inner-method');
    Sentry.setUser({ id: 'user-from-inner-method' });
  }

  /**
   * Same as `nestedScopeCheck`, but the nested call lands on `fetch` — an instrumented handler that
   * opens an isolation scope of its own. Reaching it from inside another invocation must not fork
   * again, or the nested handler would not see what the calling method set.
   *
   * The capture happens inside the nested call rather than after it: the nested handler tears its
   * client down on the way out, so a capture in the calling method would have no transport left.
   */
  async reentrantScopeCheck(): Promise<string> {
    Sentry.setTag('reentrant_outer_tag', 'from-rpc-method');
    Sentry.setUser({ id: 'user-from-rpc-method' });

    await this.fetch(new Request('https://durable-object.invalid/inner'));

    return 'ok';
  }

  async fetch(_request: Request): Promise<Response> {
    Sentry.setTag('fetch_tag', 'from-nested-fetch');
    Sentry.captureException(new Error('Reentrant inner'));

    // Deliberately bodyless. A `text/plain` body without a `content-length` is classified as
    // streaming, and nothing here ever reads the nested response, so the span would stay open and
    // hold up the flush.
    return new Response(null, { status: 204 });
  }
}

export const ScopeDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
  }),
  ScopeDurableObjectBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
    rpcTracePropagationTargets: ['SCOPE_DO'],
  }),
  {
    async fetch(request, env) {
      const url = new URL(request.url);

      if (url.pathname === '/scope') {
        // Always the same instance, so both invocations land on the same Durable Object.
        const stub = env.SCOPE_DO.get(env.SCOPE_DO.idFromName('scope-do')) as DurableObjectStub<ScopeDurableObjectBase>;

        return new Response(await stub.scopeCheck(url.searchParams.get('seed') === '1'));
      }

      if (url.pathname === '/nested') {
        const stub = env.SCOPE_DO.get(env.SCOPE_DO.idFromName('scope-do')) as DurableObjectStub<ScopeDurableObjectBase>;

        return new Response(await stub.nestedScopeCheck());
      }

      if (url.pathname === '/reentrant') {
        const stub = env.SCOPE_DO.get(env.SCOPE_DO.idFromName('scope-do')) as DurableObjectStub<ScopeDurableObjectBase>;

        return new Response(await stub.reentrantScopeCheck());
      }

      return new Response('Hello World!');
    },
  } satisfies ExportedHandler<Env>,
);
