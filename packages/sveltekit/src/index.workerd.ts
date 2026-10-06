import * as cloudflareWorkers from 'cloudflare:workers';
import { setCloudflareExecutionContextFallback } from './server-common/utils';

// `cloudflare:workers` only resolves in Cloudflare's own bundlers (wrangler, `@cloudflare/vite-plugin`),
// which all select the `workerd` export condition. Consumers of the generic `worker` condition keep
// getting `index.worker`, which has no such import and would otherwise fail to bundle.
//
// A namespace import keeps a missing `waitUntil` export (runtimes older than August 2025) a missing
// property instead of a module linking error that would take the whole Worker down.
setCloudflareExecutionContextFallback(() =>
  typeof cloudflareWorkers.waitUntil === 'function' ? { waitUntil: cloudflareWorkers.waitUntil } : undefined,
);

export * from './worker';
