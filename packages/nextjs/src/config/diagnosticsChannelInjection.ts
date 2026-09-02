import { loadOrchestrionBundler } from './loadOrchestrionBundler';

/**
 * Instrumented packages verified (via e2e) to bundle correctly, removed from Sentry's own
 * `serverExternalPackages` defaults so the build-time loader can transform them. Everything else
 * stays external and is instrumented by the runtime module hook instead. Deliberately an
 * allowlist — bundling can break packages outright (e.g. `mysql` 2.x under Turbopack).
 */
export const BUNDLE_SAFE_INSTRUMENTED_PACKAGES = ['ioredis'];

/**
 * `@sentry/server-utils` (where `register.ts` and the bundled orchestrion runtime ship) must stay
 * external: `register.ts` passes its own `__filename`/`import.meta.url` as the `parentURL` for
 * `Module.register('@sentry/server-utils/orchestrion/hook.mjs', …)`, so that self-reference only
 * resolves while the code still lives at its real `node_modules` location. Bundled into an app
 * server chunk instead, the specifier would have to resolve from the chunk's output location,
 * which fails under isolated installs (pnpm) where the package is a transitive dependency.
 *
 * (The `@apm-js-collab/*` packages no longer appear here: they are bundled into
 * `@sentry/server-utils`' build, so no import of them exists at runtime.)
 */
export const ORCHESTRION_RUNTIME_EXTERNAL_PACKAGES = ['@sentry/server-utils'];

/** Remove the given packages from a `serverExternalPackages` list. */
export function filterInstrumentedExternals(externals: string[], packagesToBundle: string[]): string[] {
  const set = new Set(packagesToBundle);
  return externals.filter(name => !set.has(name));
}

/**
 * A webpack `externals` array entry that keeps {@link ORCHESTRION_RUNTIME_EXTERNAL_PACKAGES} truly
 * external by resolving each request to an absolute path at build time and emitting a
 * `commonjs <absolute path>` external.
 *
 * Listing the packages in `serverExternalPackages` is not enough: Next.js only externalizes a
 * package when its bare specifier also resolves from the project root (`resolveExternal`'s
 * base-resolve check in `next/dist/build/handle-externals.js`) — otherwise the
 * `require('<bare specifier>')` it emits into the chunk would dangle at runtime, so Next silently
 * bundles the package instead. Under isolated installs (pnpm) the package is a transitive
 * dependency that never resolves from the project root, so the orchestrion runtime ended up
 * compiled into the server chunk — breaking the `Module.register` self-reference described on
 * {@link ORCHESTRION_RUNTIME_EXTERNAL_PACKAGES}. Absolute paths sidestep all of this — webpack
 * emits `require('/abs/path/…')`, which loads the real files from `node_modules` no matter where
 * the chunk lives.
 *
 * Must be placed *before* Next's own externals handler in the `externals` array: webpack calls
 * array entries in order and stops at the first one that returns a result.
 */
export async function externalizeOrchestrionRuntimePackages({
  request,
}: {
  request?: string;
}): Promise<string | undefined> {
  if (
    !request ||
    !ORCHESTRION_RUNTIME_EXTERNAL_PACKAGES.some(pkg => request === pkg || request.startsWith(`${pkg}/`))
  ) {
    return undefined;
  }

  const resolved = loadOrchestrionBundler().resolveOrchestrionRuntimeRequest(request);
  return resolved ? `commonjs ${resolved}` : undefined;
}
