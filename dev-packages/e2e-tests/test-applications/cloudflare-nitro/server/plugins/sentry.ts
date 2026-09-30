import { getDefaultIntegrations, setAsyncLocalStorageAsyncContextStrategy } from '@sentry/cloudflare';
import { wrapRequestHandler } from '@sentry/cloudflare/request';
import { definePlugin } from 'nitro';

/**
 * Initializes the Cloudflare SDK for a raw Nitro app.
 *
 * There is no first-class `@sentry/nitro` Cloudflare helper yet, so this replicates what
 * `@sentry/nuxt`'s `sentryCloudflareNitroPlugin` does, adapted to Nitro 3: it wraps `nitroApp.fetch`
 * (Nitro 3 has no `localFetch`) with `wrapRequestHandler`. Nitro's `cloudflare_module` preset
 * augments the incoming request with `request.runtime.cloudflare = { env, context }`
 * (see the preset's `augmentReq`), which is where the DSN and the execution context come from.
 *
 * The `nitroIntegration` / `nitroServerTimingIntegration` span + header instrumentation is not set
 * up here — it is auto-injected by the orchestrion transform (see `vite.config.ts`) and instantiated
 * by `getDefaultIntegrations()` from the global orchestrion marker.
 */
export default definePlugin(nitroApp => {
  const originalFetch = nitroApp.fetch;

  nitroApp.fetch = (
    request: Request & { runtime?: { cloudflare?: { env?: Record<string, unknown>; context?: unknown } } },
  ) => {
    setAsyncLocalStorageAsyncContextStrategy();

    const cloudflare = request.runtime?.cloudflare ?? {};
    const env = (cloudflare.env ?? (globalThis as { __env__?: Record<string, unknown> }).__env__ ?? {}) as {
      E2E_TEST_DSN?: string;
    };

    const options = {
      dsn: env.E2E_TEST_DSN,
      environment: 'qa',
      tunnel: 'http://localhost:3031/',
      tracesSampleRate: 1.0,
    };

    return wrapRequestHandler(
      {
        // `wrapRequestHandler` defaults to the Node-free integration set; the `nodejs_compat` flag is
        // on for the Cloudflare preset, so opt into the full set to match a normal Cloudflare init.
        options: { ...options, defaultIntegrations: getDefaultIntegrations(options) },
        request,
        context: cloudflare.context as ExecutionContext | undefined,
      },
      () => originalFetch(request),
    );
  };
});
