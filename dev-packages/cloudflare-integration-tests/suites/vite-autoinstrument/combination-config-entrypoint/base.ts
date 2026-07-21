import { WorkerEntrypoint } from 'cloudflare:workers';

// Base class in a separate module. Because the entry file imports it rather than
// declaring it, the transform's structural detection can't see that it extends
// `WorkerEntrypoint` — so the wrapping relies on the wrangler config's
// `services[].entrypoint` self-binding instead.
export class AdminEntrypointBase<Env = unknown> extends WorkerEntrypoint<Env> {}
