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

/**
 * `@apm-js-collab/tracing-hooks/hook-sync.mjs` is ESM-only with no CJS equivalent, but
 * `@sentry/server-utils`'s `register.ts` must `require()` it synchronously at runtime (see that
 * file). Next.js's webpack config refuses to compile any bare `require()` of an ESM-only package
 * (`ESM packages (...) need to be imported`, thrown by `handleExternals` in `next/dist/build/handle-externals.js`)
 * unless the app-wide `experimental.esmExternals: 'loose'` flag is set — which we don't want to force
 * on every user, and which routes through a separate Next.js ESM-interop codepath that has its own
 * `require(esm)` parent-URL misattribution bug at runtime.
 *
 * Being in `serverExternalPackages`/`ORCHESTRION_RUNTIME_EXTERNAL_PACKAGES` above doesn't help here:
 * Next's ESM guard throws before it even considers whether a package is externalized.
 */
export const ESM_ONLY_ORCHESTRION_SPECIFIERS = ['@apm-js-collab/tracing-hooks/hook-sync.mjs'];

/**
 * A webpack `externals` array entry that externalizes {@link ESM_ONLY_ORCHESTRION_SPECIFIERS} as
 * plain `commonjs` requires — the same declaration Next.js's own `handleExternals` would produce for
 * a genuinely CJS package — so its ESM guard never sees (and never throws on) these specifiers.
 *
 * Must be placed *before* Next's own externals handler in the `externals` array: webpack calls array
 * entries in order and stops at the first one that returns a result.
 */
export async function externalizeEsmOnlyOrchestrionSpecifiers({
  request,
}: {
  request?: string;
}): Promise<string | undefined> {
  return request && ESM_ONLY_ORCHESTRION_SPECIFIERS.includes(request) ? `commonjs ${request}` : undefined;
}
