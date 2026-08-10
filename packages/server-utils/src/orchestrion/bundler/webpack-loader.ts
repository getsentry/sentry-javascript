// The webpack/Turbopack code-transform loader. Built with the upstream loader
// factory so the module-injected custom transform is baked into the loader
// module itself: Turbopack (and worker-based loaders like `thread-loader`)
// serialize loader options as JSON, so function-valued options can never reach
// a loader — everything that crosses that boundary must stay serializable.
// Compiled into this package's build (the `@apm-js-collab` packages are bundled
// devDependencies and not resolvable on user installs); bundlers reference it
// by on-disk path via `getOrchestrionLoaderPath()`, so it needs its own
// entrypoint/subpath rather than being reachable from another module.
import { createLoader } from '@apm-js-collab/code-transformer-bundler-plugins/webpack-loader-factory';
import { dirname, relative } from 'node:path';
import { moduleInjectedTransforms } from './moduleInjectedTransform';

interface LoaderOptions {
  /** Fixed import specifier for the module-injected snippet. */
  importSpecifier?: string;
  /**
   * Absolute path to the `@sentry/server-utils/orchestrion` helper module. When
   * set, the snippet imports a PER-FILE RELATIVE path to it: Turbopack rejects
   * absolute-path imports ("server relative imports are not implemented yet"),
   * and a bare specifier emitted inside a transformed package doesn't resolve
   * from that package's location under isolated installs (pnpm). A relative
   * specifier is resolved from the importing file and consumed entirely at
   * build time. Takes precedence over `importSpecifier`.
   */
  importHelperPath?: string;
}

// The slice of the loader context we touch ourselves; everything else is the
// factory-built loader's business.
interface LoaderContext {
  resourcePath: string;
  getOptions: () => LoaderOptions;
}

type LoaderFn = (this: LoaderContext, code: string, inputSourceMap?: unknown) => void;

// Read lazily by the baked-in transform each time it splices a snippet, so ONE
// loader (and one upstream matcher) serves every per-file specifier. Safe as a
// module-level slot: the write below and the factory loader's transform run
// synchronously within a single loader invocation.
let currentImportSpecifier: string | undefined;

const factoryLoader = createLoader({
  customTransforms: moduleInjectedTransforms(() => currentImportSpecifier),
}) as LoaderFn;

function relativeImportSpecifier(fromFile: string, toFile: string): string {
  const rel = relative(dirname(fromFile), toFile).replace(/\\/g, '/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/**
 * Reads the Sentry-specific options (unknown to the upstream loader, which
 * reads only its own fields), stages the snippet specifier for this file, and
 * delegates to the factory-built loader. `instrumentations` stays a plain
 * per-rule loader option, read by the upstream loader itself.
 */
const codeTransformerLoader: LoaderFn = function (code, inputSourceMap) {
  const { importSpecifier, importHelperPath } = this.getOptions();
  currentImportSpecifier = importHelperPath
    ? relativeImportSpecifier(this.resourcePath, importHelperPath)
    : importSpecifier;
  return factoryLoader.call(this, code, inputSourceMap);
};

export default codeTransformerLoader;
