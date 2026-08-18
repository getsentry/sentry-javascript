import type { env as cloudflareEnv } from 'cloudflare:workers';
import type { CloudflareOptions } from './client';

type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * `CloudflareOptions` for the options *callbacks*, where the excess property check does not reach.
 *
 * A plain `CloudflareOptions` parameter already rejects unknown keys when the caller writes a
 * direct object literal, which is why it is enough everywhere else. That check only applies to
 * literals TypeScript still sees as "fresh", though, and freshness is lost across a function
 * boundary — the literal returned from `withSentry(() => ({ dsn, tracesSampleRte: 1 }), handler)`
 * is compared as part of a function type, so the typo passes. Since `env` only exists at request
 * time, a callback is the only way to configure these APIs, so the check has to be rebuilt:
 * inferring the literal into `O` and intersecting it with a `never` map over its extra keys puts
 * the error back on the offending property.
 *
 * `O` is deliberately unconstrained: a `CloudflareOptions` constraint makes inference fail for an
 * options object whose keys are *all* unknown, and TypeScript then silently falls back to the type
 * parameter default instead of reporting anything. The `CloudflareOptions` member of the
 * intersection carries the actual check on known keys.
 *
 * The function-rejecting branch keeps "returned the options factory instead of calling it" an
 * error. A plain `CloudflareOptions` target rejects functions via the weak type check (no shared
 * properties), but an intersection is only weak-type checked when every member is weak, and the
 * `Record` member has no properties at all — so without the guard a function would slip through.
 * `keyof` of a function type is `never`, so the never-map alone cannot catch it.
 *
 * Two known gaps: this only covers top level keys, and unlike a plain excess property check it
 * also rejects a pre-built object carrying extra keys.
 */
export type StrictCloudflareOptions<O> = O extends (...args: never[]) => unknown
  ? never
  : O & CloudflareOptions & Record<Exclude<keyof O, keyof CloudflareOptions>, never>;

/**
 * A handler method of an `ExportedHandler` (`fetch`, `scheduled`, `queue`, ...).
 */
// oxlint-disable-next-line typescript/no-explicit-any
type AnyHandlerMethod = (event: any, env: any, ctx: any) => any;

/**
 * Structural version of `ExportedHandler` that accepts every env/message/metadata/props
 * combination. Used as the handler constraint of `withSentry` instead of
 * `ExportedHandler<any, any, any>`: on `@cloudflare/workers-types` v5, `ExportedHandler`
 * has a 4th generic (`ExecutionContext<Props>`) which defaults to `unknown`, so a direct
 * `ExportedHandler<any, any, any>` constraint rejects handlers typed with a concrete
 * `Props`. Referencing the 4th generic is not an option either — it does not exist on v4,
 * which the SDK also supports.
 */
export interface AnyExportedHandler {
  fetch?: AnyHandlerMethod;
  scheduled?: AnyHandlerMethod;
  queue?: AnyHandlerMethod;
  email?: AnyHandlerMethod;
  tail?: AnyHandlerMethod;
  trace?: AnyHandlerMethod;
  tailStream?: AnyHandlerMethod;
  connect?: AnyHandlerMethod;
  test?: AnyHandlerMethod;
}

type HandlerMethodName = keyof AnyExportedHandler;

/**
 * Extracts the `Env` type from a handler method signature (its second parameter).
 * `any` methods are skipped: framework app types like Hono's carry a string index
 * signature, which would otherwise make every missing handler method read as `any`
 * and poison the inferred env.
 */
// oxlint-disable-next-line typescript/no-explicit-any
type EnvFromMethod<Method> =
  IsAny<Method> extends true
    ? never
    : // oxlint-disable-next-line typescript/no-explicit-any
      Method extends (event: any, env: infer Env, ctx: any) => any
      ? Env
      : never;

/**
 * Extracts the `Env` type from an `ExportedHandler`-shaped type.
 *
 * This infers the env from any of the handler methods (`fetch`, `scheduled`, `queue`, ...),
 * so a handler literal with `satisfies ExportedHandler<Env>` or a pre-typed
 * `ExportedHandler<Env>` both yield their `Env`. The structural read (instead of
 * `T extends ExportedHandler<infer Env, ...>`) keeps inference working for
 * `ExecutionContext<Props>`-typed handlers on workers-types v5.
 */
type InferEnvFromHandler<T> = T extends AnyExportedHandler
  ? {
      [K in HandlerMethodName]: K extends keyof T ? EnvFromMethod<T[K]> : never;
    }[HandlerMethodName]
  : never;

/**
 * Extracts the `Env` type from a class constructor type (`WorkerEntrypoint`, `DurableObject`
 * or `WorkflowEntrypoint` subclasses). The env is inferred from the second constructor parameter,
 * which carries the user's env type both for explicit constructors and for constructors inherited
 * from a `WorkerEntrypoint<Env>` / `DurableObject<Env>` / `WorkflowEntrypoint<Env>` base class.
 */
// oxlint-disable-next-line typescript/no-explicit-any
type InferEnvFromConstructor<T> = T extends new (ctx: any, env: infer Env) => any ? Env : never;

/**
 * Infers the `Env` type from a handler passed to one of the instrumentation functions.
 * Returns `never` when nothing can be inferred.
 */
export type InferEnv<T> = [InferEnvFromHandler<T>] extends [never]
  ? InferEnvFromConstructor<T>
  : InferEnvFromHandler<T>;

/**
 * Removes empty object types (`{}`) from a union. Framework handler types like Hono's
 * `fetch(request, env?: E['Bindings'] | {}, ...)` union the env with `{}`, which would
 * otherwise collapse the inferred env to "empty" — filtering keeps the meaningful member.
 */
// oxlint-disable-next-line typescript/no-explicit-any
type FilterEmptyObjects<T> = T extends any ? ([keyof T] extends [never] ? never : T) : never;

/**
 * Resolves the env type exposed on the options callback of the instrumentation functions.
 *
 * Resolution order:
 * 1. The env inferred from the passed handler (e.g. via `satisfies ExportedHandler<Env>`,
 *    a pre-typed handler, or a `WorkerEntrypoint<Env>` subclass).
 * 2. The explicitly provided `Env` generic (e.g. `withSentry<Env>(...)`), which defaults
 *    to the wrangler-generated `Cloudflare.Env` (via `typeof cloudflareEnv`).
 * 3. `any` as the last resort, so untyped setups keep compiling instead of failing on
 *    an empty `Cloudflare.Env` interface.
 */
export type ResolveEnv<Handler, ExplicitEnv> =
  IsAny<FilterEmptyObjects<InferEnv<Handler>>> extends true
    ? ExplicitEnv
    : unknown extends FilterEmptyObjects<InferEnv<Handler>>
      ? ExplicitEnv
      : [FilterEmptyObjects<InferEnv<Handler>>] extends [never]
        ? ExplicitEnv
        : FilterEmptyObjects<InferEnv<Handler>>;

/**
 * The default env type when nothing can be inferred and no explicit generic is provided:
 * the wrangler-generated `Cloudflare.Env` (via `cloudflare:workers`), falling back to `any`
 * when the project never ran `wrangler types` (the interface is empty) so property access
 * on `env` does not fail.
 */
export type DefaultEnv = [keyof typeof cloudflareEnv] extends [never]
  ? // oxlint-disable-next-line typescript/no-explicit-any
    any
  : typeof cloudflareEnv;
