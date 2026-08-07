import { createRequire } from 'node:module';

// Both branches use `createRequire` (never alias the CJS `require`) so bundlers consuming this
// module don't emit a "Critical dependency" warning.
function getOrchestrionRequire(): ReturnType<typeof createRequire> {
  let nodeRequire: ReturnType<typeof createRequire>;
  /*! rollup-include-cjs-only */
  nodeRequire = createRequire(__filename);
  /*! rollup-include-cjs-only-end */
  /*! rollup-include-esm-only */
  nodeRequire = createRequire(import.meta.url);
  /*! rollup-include-esm-only-end */
  return nodeRequire;
}

/**
 * Absolute path to the code-transform loader (a webpack loader; also usable as a Turbopack loader).
 * Resolved via self-reference to this package's own bundled copy — the `@apm-js-collab` packages
 * are bundled devDependencies and not resolvable on user installs.
 */
export function getOrchestrionLoaderPath(): string {
  return getOrchestrionRequire().resolve('@sentry/server-utils/orchestrion/webpack-loader');
}

/**
 * Resolves a request for one of the orchestrion runtime packages (`@sentry/server-utils` itself, via
 * self-reference, or its `@apm-js-collab/*` dependencies) to an absolute path, from this package's
 * own on-disk location — where the whole dependency graph always resolves, regardless of the
 * consuming app's install layout. Returns `undefined` when the request can't be resolved.
 *
 * Bundler configs use this in two ways:
 * - to emit absolute-path `commonjs` externals: a bare-specifier external emitted into a bundled
 *   chunk resolves from the chunk's output location at runtime, which fails under isolated
 *   installs (pnpm) where these packages are transitive dependencies;
 * - as a build-time resolution fallback for the `@sentry/server-utils/orchestrion` import the
 *   module-injected snippet places INSIDE transformed `node_modules` files, which a bundler
 *   resolving from the importing file's location can't find under isolated installs either.
 */
export function resolveOrchestrionRuntimeRequest(request: string): string | undefined {
  try {
    return getOrchestrionRequire().resolve(request);
  } catch {
    return undefined;
  }
}
