/**
 * Returns true if the current runtime is Next.js Edge Runtime.
 *
 * @returns `true` if the current runtime is Next.js Edge Runtime, `false` otherwise.
 */
export function isNextEdgeRuntime(): boolean {
  return process.env.NEXT_RUNTIME === 'edge';
}
