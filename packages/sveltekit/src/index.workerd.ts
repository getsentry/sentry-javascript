import type { CloudflareOptions } from '@sentry/cloudflare';
import * as cloudflareWorkers from 'cloudflare:workers';
import type { Handle } from './server-common/handleTypes';
import { setCloudflareExecutionContextFallback } from './server-common/utils';
import { initCloudflareSentryHandle as initWorkerSentryHandle } from './worker/cloudflare';

export * from './worker';

/**
 *  Initializes Sentry SvelteKit Cloudflare SDK
 *  This should be before the sentryHandle() call.
 *
 *  In the Node export, this is a stub that does nothing.
 */
export function initCloudflareSentryHandle(options: CloudflareOptions): Handle {
  // `cloudflare:workers` only resolves in Cloudflare's own bundlers (wrangler, `@cloudflare/vite-plugin`),
  // which all select the `workerd` export condition. Consumers of the generic `worker` condition keep
  // getting `index.worker`, which has no such import and would otherwise fail to bundle.
  //
  // This runs here rather than at module scope because the package is `sideEffects: false`: bundlers
  // that skip re-exporting barrels (Rolldown, which `@sveltejs/adapter-cloudflare` >= 8.0.3 bundles the
  // SDK with) drop top-level statements of this file, and with them the only source of `waitUntil`.
  //
  // A namespace import keeps a missing `waitUntil` export (runtimes older than August 2025) a missing
  // property instead of a module linking error that would take the whole Worker down.
  setCloudflareExecutionContextFallback(() =>
    typeof cloudflareWorkers.waitUntil === 'function' ? { waitUntil: cloudflareWorkers.waitUntil } : undefined,
  );

  return initWorkerSentryHandle(options);
}
