import * as cloudflareWorkers from 'cloudflare:workers';
import { setBindingsGetter } from './worker/sdk';

// `cloudflare:workers` only resolves in Cloudflare's own bundlers (wrangler, `@cloudflare/vite-plugin`),
// which all select the `workerd` export condition. Consumers of the generic `worker` condition keep
// getting `index.worker`, which has no such import and would otherwise fail to bundle.
//
// A namespace import keeps a missing `env` export (older runtimes) a missing property instead of a
// module linking error that would take the whole Worker down.
setBindingsGetter(() => cloudflareWorkers.env);

// eslint-disable-next-line import/export
export * from './index.worker';
