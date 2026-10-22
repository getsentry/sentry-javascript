import { findClassesExtending, type ProgramBody } from '@sentry/bundler-plugins/rewriter';

/**
 * Find top-level classes that (transitively, within this module) extend
 * `WorkerEntrypoint` imported from `cloudflare:workers`.
 *
 * Only same-file base chains are resolvable here; a base class imported from
 * another module is invisible and relies on the config self-binding fallback.
 */
export function detectWorkerEntrypointClasses(ast: ProgramBody): Set<string> {
  return findClassesExtending(ast, { module: 'cloudflare:workers', name: 'WorkerEntrypoint' });
}
