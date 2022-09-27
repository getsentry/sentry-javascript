/**
 * Decide if the currently running process is part of the build phase or happening at runtime.
 */
export function isBuild(): boolean {
  // Next.js sets the `NEXT_PHASE` env var depending on what phase/environment we're in.
  // These phases are constants within the Next.js codebase but sadly they're not exported in a way that we can easily
  // import them with our rollup setup so we're simply vendoring the relevant constant ourselves.
  // This constant hasn't changed in the Next.js codebase since next@10:
  // Most recent: https://github.com/vercel/next.js/blob/406d69d4d9f7d14b9bf497a134f0151914b13964/packages/next/shared/lib/constants.ts#L20
  // v10: https://github.com/vercel/next.js/blob/118ab7992bc8f7a7e5a7bb996510d9b56ffe4f68/packages/next/next-server/lib/constants.ts#L2
  const PHASE_PRODUCTION_BUILD = 'phase-production-build';
  return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
}
