import { resolveOrchestrionRuntimeRequest } from '@sentry/server-utils/orchestrion/webpack';

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
 * A webpack `externals` array entry that keeps {@link ORCHESTRION_RUNTIME_EXTERNAL_PACKAGES} truly
 * external by resolving each request to an absolute path at build time and emitting a
 * `commonjs <absolute path>` external.
 *
 * Listing the packages in `serverExternalPackages` is not enough: Next.js only externalizes a
 * package when its bare specifier also resolves from the project root (`resolveExternal`'s
 * base-resolve check in `next/dist/build/handle-externals.js`) — otherwise the
 * `require('<bare specifier>')` it emits into the chunk would dangle at runtime, so Next silently
 * bundles the package instead. Under isolated installs (pnpm) these packages are transitive
 * dependencies that never resolve from the project root, so the whole orchestrion runtime ended up
 * compiled into the server chunk, which breaks it twice over: the code-transformer parser doesn't
 * survive bundling, and the runtime hook's own bare specifiers can't resolve from the chunk's
 * output location. Absolute paths sidestep all of this — webpack emits `require('/abs/path/…')`,
 * which loads the real files from `node_modules` no matter where the chunk lives.
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

  const resolved = resolveOrchestrionRuntimeRequest(request);
  return resolved ? `commonjs ${resolved}` : undefined;
}
