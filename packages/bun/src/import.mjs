/**
 * Orchestrion runtime hook for Bun 1.4.6 and later.
 *
 * `init()` registers the same hook, but it only applies to modules imported
 * after `init()`. Load this via the `--preload` argument to `bun run`, or the
 * `preload` option in `bunfig.toml`, to also instrument modules imported
 * before it, such as static imports in the entry module.
 *
 * For example:
 *
 * ```bash
 * $ bun --preload @sentry/bun/import app.ts
 * ```
 *
 * @module
 */
import { registerBunRuntimeInjection } from '@sentry/server-runtime-injection/bun';

registerBunRuntimeInjection();
