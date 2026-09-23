import { createRequire } from 'node:module';

/**
 * Instrumented packages verified (via e2e) to bundle correctly, removed from Sentry's own
 * `serverExternalPackages` defaults so the build-time loader can transform them. Everything else
 * stays external and is instrumented by the runtime module hook instead. Deliberately an
 * allowlist — bundling can break packages outright (e.g. `mysql` 2.x under Turbopack).
 */
export const BUNDLE_SAFE_INSTRUMENTED_PACKAGES = ['ioredis'];

/**
 * `@sentry/server-runtime-injection` (where `register.ts` and the bundled orchestrion runtime ship)
 * must stay external: `register.ts` passes its own `__filename`/`import.meta.url` as the `parentURL`
 * for `Module.register()` and resolves the ESM loader hook relative to that same location, so both
 * only work while the code still lives at its real `node_modules` location. Bundled into an app
 * server chunk instead, they would resolve from the chunk's output location, where neither the hook
 * nor the vendored transformer it loads exists.
 *
 * `@sentry/server-utils` (the barrel + bundler plugins) is NOT here — it is meant to be bundled; the
 * build-time snippet's `@sentry/server-utils` import is handled separately by the code-transform.
 */
export const ORCHESTRION_RUNTIME_EXTERNAL_PACKAGES = ['@sentry/server-runtime-injection'];

// `require` anchored at THIS package (`@sentry/nextjs`), which depends on
// `@sentry/server-runtime-injection` — so the resolvability check below works even under isolated
// installs (pnpm), where a resolver anchored at `@sentry/server-utils` could not see it.
let nextjsRequire: NodeJS.Require;
/*! rollup-include-cjs-only */
nextjsRequire = createRequire(__filename);
/*! rollup-include-cjs-only-end */
/*! rollup-include-esm-only */
nextjsRequire = createRequire(import.meta.url);
/*! rollup-include-esm-only-end */

/** Whether `request` resolves as a `require`-able module (skips ESM-only subpaths like `/hook`). */
function isRequireResolvable(request: string): boolean {
  try {
    nextjsRequire.resolve(request);
    return true;
  } catch {
    return false;
  }
}

/** Remove the given packages from a `serverExternalPackages` list. */
export function filterInstrumentedExternals(externals: string[], packagesToBundle: string[]): string[] {
  const set = new Set(packagesToBundle);
  return externals.filter(name => !set.has(name));
}

/**
 * Where the generated forwarders live — one CJS one-liner per `@sentry/server-runtime-injection` entrypoint
 * (see `scripts/buildRollup.ts`). Forwarding through `@sentry/nextjs`, always a direct dependency,
 * is what makes the emitted specifier both resolvable from `.next/server/**` and relocation-safe.
 */
const ORCHESTRION_FORWARDER_PREFIX = '@sentry/nextjs/orchestrion-runtime/';

/** The forwarder specifier mirroring `request`: `<pkg>/a/b` → `…/orchestrion-runtime/a/b`. */
export function getOrchestrionForwarderSpecifier(request: string, externalPackage: string): string {
  const subpath = request.slice(externalPackage.length + 1);
  return `${ORCHESTRION_FORWARDER_PREFIX}${subpath || 'index'}`;
}

/**
 * A webpack `externals` array entry that keeps {@link ORCHESTRION_RUNTIME_EXTERNAL_PACKAGES}
 * external, via the matching forwarder under {@link ORCHESTRION_FORWARDER_PREFIX}.
 *
 * `serverExternalPackages` can't do this: Next only externalizes a package whose bare specifier
 * also resolves from the project root (`resolveExternal`'s base-resolve check in
 * `next/dist/build/handle-externals.js`), and under isolated installs this one doesn't — so Next
 * silently bundles it, breaking the `Module.register` self-reference described on
 * {@link ORCHESTRION_RUNTIME_EXTERNAL_PACKAGES}.
 *
 * Must be placed *before* Next's own externals handler: webpack calls array entries in order and
 * stops at the first result.
 */
export async function externalizeOrchestrionRuntimePackages({
  request,
}: {
  request?: string;
}): Promise<string | undefined> {
  const externalPackage = request
    ? ORCHESTRION_RUNTIME_EXTERNAL_PACKAGES.find(pkg => request === pkg || request.startsWith(`${pkg}/`))
    : undefined;

  if (!request || !externalPackage) {
    return undefined;
  }

  // Not `require`-able (ESM-only subpath, or a typo): webpack reports it better than we can.
  if (!isRequireResolvable(request)) {
    return undefined;
  }

  return `commonjs ${getOrchestrionForwarderSpecifier(request, externalPackage)}`;
}
