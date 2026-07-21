/**
 * Instrumented packages verified (via e2e) to bundle correctly, removed from Sentry's own
 * `serverExternalPackages` defaults so the build-time loader can transform them. Everything else
 * stays external and is instrumented by the runtime module hook instead. Deliberately an
 * allowlist — bundling can break packages outright (e.g. `mysql` 2.x under Turbopack).
 */
export const BUNDLE_SAFE_INSTRUMENTED_PACKAGES = ['ioredis'];

/**
 * The orchestrion runtime machinery must stay external — its parser breaks when bundled, which
 * silently disables the runtime module hook.
 *
 * `@sentry/server-utils` (the package `register.ts` — the code that actually calls into
 * `@apm-js-collab/tracing-hooks` — ships in) is included too: if it stays external, its own
 * `__filename`/`import.meta.url` keep pointing at their real `node_modules` location, so its
 * bare-specifier `require`/`import` of the (also-external) tracing-hooks packages resolve
 * correctly. If `@sentry/server-utils` were bundled into an app server chunk instead, its code
 * would be relocated away from `node_modules`, and those same specifiers would fail to resolve
 * under isolated installs (pnpm).
 */
export const ORCHESTRION_RUNTIME_EXTERNAL_PACKAGES = [
  '@apm-js-collab/tracing-hooks',
  '@apm-js-collab/code-transformer',
  '@sentry/server-utils',
];

/** Remove the given packages from a `serverExternalPackages` list. */
export function filterInstrumentedExternals(externals: string[], packagesToBundle: string[]): string[] {
  const set = new Set(packagesToBundle);
  return externals.filter(name => !set.has(name));
}
