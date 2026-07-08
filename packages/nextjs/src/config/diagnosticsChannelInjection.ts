/**
 * Instrumented packages that are verified to bundle correctly under Turbopack. Only these are
 * removed from Sentry's own `serverExternalPackages` defaults, so the build-time loader can
 * transform them. Everything else instrumented stays externalized — Next's own defaults, the
 * user's config, and the rest of Sentry's defaults are never overridden — and is instrumented by
 * the runtime module hook on `require` instead.
 *
 * Deliberately an allowlist: bundling a server package changes real behavior (e.g. `mysql` 2.x
 * corrupts its wire protocol when bundled by Turbopack, even untransformed), so packages are only
 * added here once bundling them is e2e-verified.
 */
export const BUNDLE_SAFE_INSTRUMENTED_PACKAGES = ['ioredis'];

/**
 * The orchestrion runtime machinery, which must NOT be bundled: the code transformer's parser
 * breaks when bundled ("a.parse is not a function"), making the runtime module hook silently
 * return untransformed sources. Externalizing these keeps the hook running from real
 * `node_modules`, so externalized instrumented packages (e.g. `pg`, `mysql`) get transformed on
 * require.
 */
export const ORCHESTRION_RUNTIME_EXTERNAL_PACKAGES = [
  '@apm-js-collab/tracing-hooks',
  '@apm-js-collab/code-transformer',
];

/** Remove the given packages from a `serverExternalPackages` list. */
export function filterInstrumentedExternals(externals: string[], packagesToBundle: string[]): string[] {
  const set = new Set(packagesToBundle);
  return externals.filter(name => !set.has(name));
}
