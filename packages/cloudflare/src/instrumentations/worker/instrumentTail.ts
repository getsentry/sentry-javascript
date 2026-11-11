import type { AnyExportedHandler } from '../../types';
import type { env as cloudflareEnv, WorkerEntrypoint } from 'cloudflare:workers';
import { captureException, withIsolationScope } from '@sentry/core';
import type { CloudflareOptions } from '../../client';
import { flushAndDispose } from '../../flush';
import { ensureInstrumented } from '../../instrument';
import { getFinalOptions } from '../../options';
import { addCloudResourceContext } from '../../scope-utils';
import { init } from '../../sdk';
import { instrumentContext } from '../../utils/instrumentContext';
import { setInvocationState } from '../../utils/invocationContext';
import { type UncheckedMethod } from '../../wrapMethodWithSentry';
import { instrumentEnv } from './instrumentEnv';

type TailMethod = 'tail' | 'trace' | 'tailStream';

const TAIL_METHODS: TailMethod[] = ['tail', 'trace', 'tailStream'];

const MECHANISM_TYPES: Record<TailMethod, string> = {
  tail: 'auto.faas.cloudflare.tail',
  trace: 'auto.faas.cloudflare.trace',
  tailStream: 'auto.faas.cloudflare.tail_stream',
};

/**
 * Core tail handler logic - wraps execution with Sentry instrumentation.
 * Note: tail handlers don't create spans, just error capture.
 */
function wrapTailHandler(
  options: CloudflareOptions,
  context: ExecutionContext,
  method: TailMethod,
  fn: () => unknown,
): unknown {
  return withIsolationScope(async isolationScope => {
    const waitUntil = context.waitUntil.bind(context);

    setInvocationState(isolationScope, { ctx: context });

    const client = init({ ...options, ctx: context });
    isolationScope.setClient(client);

    addCloudResourceContext(isolationScope);

    try {
      return await fn();
    } catch (e) {
      captureException(e, { mechanism: { handled: false, type: MECHANISM_TYPES[method] } });
      throw e;
    } finally {
      waitUntil(flushAndDispose(client));
    }
  });
}

/**
 * workerd calls `tailStream()` once with the onset event, then calls the
 * function or object methods it returns for each later batch of events.
 * Each of those calls runs as its own invocation.
 */
function wrapTailStreamEventHandler(
  eventHandler: unknown,
  options: CloudflareOptions,
  context: ExecutionContext,
): unknown {
  const wrap = (fn: UncheckedMethod, getThis: (thisArg: unknown) => unknown): UncheckedMethod =>
    new Proxy(fn, {
      apply(target, thisArg, args) {
        return wrapTailHandler(options, context, 'tailStream', () => Reflect.apply(target, getThis(thisArg), args));
      },
    });

  if (typeof eventHandler === 'function') {
    return wrap(eventHandler as UncheckedMethod, thisArg => thisArg);
  }

  if (eventHandler && typeof eventHandler === 'object') {
    const proxy: object = new Proxy(eventHandler, {
      get(target, prop) {
        // Getters and methods run with the raw object as `this`, so private
        // fields work. workerd calls each method with the proxy as `this`.
        // Rebinding it also keeps `this.helper()` in this invocation.
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function'
          ? wrap(value as UncheckedMethod, thisArg => (thisArg === proxy ? target : thisArg))
          : value;
      },
    });
    return proxy;
  }

  return eventHandler;
}

function runTailMethod(
  method: TailMethod,
  options: CloudflareOptions,
  context: ExecutionContext,
  invoke: () => unknown,
): unknown {
  if (method !== 'tailStream') {
    return wrapTailHandler(options, context, method, invoke);
  }

  return wrapTailHandler(options, context, method, async () =>
    wrapTailStreamEventHandler(await invoke(), options, context),
  );
}

/**
 * Instruments the `tail`, `trace` and `tailStream` handlers for
 * ExportedHandler (env/ctx come from args).
 */
export function instrumentExportedHandlerTail<T extends AnyExportedHandler>(
  handler: T,
  optionsCallback: (env: typeof cloudflareEnv) => CloudflareOptions | undefined,
): void {
  for (const method of TAIL_METHODS) {
    if (!(method in handler)) {
      continue;
    }

    const original = handler[method];
    if (typeof original !== 'function') {
      continue;
    }

    handler[method] = ensureInstrumented(
      original,
      original =>
        new Proxy(original, {
          apply(target, thisArg, args: Parameters<UncheckedMethod>) {
            const [, env, ctx] = args;
            const context = instrumentContext(ctx);
            const options = getFinalOptions(optionsCallback(env), env);
            args[1] = instrumentEnv(env, options);
            args[2] = context;

            return runTailMethod(method, options, context, () => target.apply(thisArg, args));
          },
        }),
    );
  }
}

/**
 * Instruments the `tail`, `trace` and `tailStream` methods for
 * WorkerEntrypoint (options/context already available).
 */
export function instrumentWorkerEntrypointTail<T extends WorkerEntrypoint>(
  instance: T,
  options: CloudflareOptions,
  context: ExecutionContext,
): void {
  const methods = instance as Partial<Record<TailMethod, UncheckedMethod>>;

  for (const method of TAIL_METHODS) {
    const original = methods[method];
    if (!original) {
      continue;
    }

    methods[method] = new Proxy(original.bind(instance), {
      apply(target, thisArg, args) {
        return runTailMethod(method, options, context, () => Reflect.apply(target, thisArg, args));
      },
    });
  }
}
