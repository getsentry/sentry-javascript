import type { DurableObjectState, ExecutionContext, ExportedHandler } from '@cloudflare/workers-types';
import type { CloudflareOptions } from '@sentry/cloudflare';
import { instrumentDurableObjectWithSentry, withSentry } from '@sentry/cloudflare';
import { _INTERNAL_captureOptionsSetByUser, applySdkMetadata } from '@sentry/core';
// A namespace import keeps a missing `withEnv` export a missing property instead of a module linking error.
import * as cloudflareWorkers from 'cloudflare:workers';
import { getBuildAssetRequestFilters } from './buildAssetRequestFilters';
import { withNuxtTracingChannelIntegration } from './nuxtTracingChannelIntegration';

type OptionsCallback = (env: unknown) => CloudflareOptions;
type NitroDurableObjectClass = new (state: DurableObjectState, env: unknown) => object;
type Method = (this: unknown, ...args: unknown[]) => unknown;

/**
 * Wraps the default export of the Nitro Worker entry with `withSentry`. Each handler runs with the `env` that
 * `withSentry` instruments as the `env` of `cloudflare:workers`, so db0 of Nitro 3 reads instrumented D1 bindings.
 * `buildAssetsPath` is `app.baseURL` + `app.buildAssetsDir`, the path of the build output that the SDK ignores.
 */
export function wrapNitroCloudflareEntryWithSentry<Handler extends ExportedHandler>(
  optionsCallback: OptionsCallback,
  handler: Handler,
  buildAssetsPath?: string,
): Handler {
  const handlerWithEnv = Object.fromEntries(
    Object.entries(handler).map(([name, value]) => [
      name,
      typeof value === 'function'
        ? (event: unknown, env: unknown, context: ExecutionContext): unknown =>
            runWithEnv(env, () => (value as Method).call(handler, event, env, context))
        : value,
    ]),
  ) as Handler;

  const optionsCallbackWithMetadata = withNuxtSdkOptions(optionsCallback);
  // Nitro sends a request for a build file that the Cloudflare assets do not have to `env.ASSETS` before the Nitro app
  // runs, but `withSentry` sees the request.
  return withSentry(env => {
    const options = optionsCallbackWithMetadata(env);
    return {
      ...options,
      ignoreSpans: [...(options.ignoreSpans || []), ...getBuildAssetRequestFilters(buildAssetsPath)],
    };
  }, handlerWithEnv);
}

/**
 * Wraps the Durable Object class of the Nitro Worker entry with `instrumentDurableObjectWithSentry`. Each method runs
 * with the instrumented `this.env` as the `env` of `cloudflare:workers`.
 */
export function wrapNitroDurableObjectWithSentry(
  optionsCallback: OptionsCallback,
  NitroDurableObject: NitroDurableObjectClass,
): NitroDurableObjectClass {
  class NitroDurableObjectWithEnv extends NitroDurableObject {}

  for (const name of Object.getOwnPropertyNames(NitroDurableObject.prototype)) {
    const method: unknown = Object.getOwnPropertyDescriptor(NitroDurableObject.prototype, name)?.value;
    if (name === 'constructor' || typeof method !== 'function') {
      continue;
    }

    // Frameworks can read the name of a method, so the wrapper keeps it.
    const { [name]: methodWithEnv } = {
      [name](this: { env?: unknown }, ...args: unknown[]): unknown {
        return runWithEnv(this.env, () => (method as Method).apply(this, args));
      },
    };
    Object.defineProperty(NitroDurableObjectWithEnv.prototype, name, {
      value: methodWithEnv,
      writable: true,
      configurable: true,
    });
  }

  return instrumentDurableObjectWithSentry(withNuxtSdkOptions(optionsCallback), NitroDurableObjectWithEnv);
}

function runWithEnv(env: unknown, callback: () => unknown): unknown {
  return cloudflareWorkers.withEnv && env !== undefined ? cloudflareWorkers.withEnv(env, callback) : callback();
}

function withNuxtSdkOptions(optionsCallback: OptionsCallback): OptionsCallback {
  return env => {
    const userOptions = _INTERNAL_captureOptionsSetByUser({ ...optionsCallback(env) });
    const options = { ...userOptions, integrations: withNuxtTracingChannelIntegration(userOptions.integrations) };
    applySdkMetadata(options, 'nuxt', ['nuxt', 'cloudflare']);
    return options;
  };
}
