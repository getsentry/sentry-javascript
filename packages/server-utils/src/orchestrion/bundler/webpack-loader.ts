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
import { moduleInjectedTransforms } from './moduleInjectedTransform';

// The slice of the loader context we touch ourselves; everything else is the
// factory-built loader's business.
interface LoaderContext {
  getOptions: () => { importSpecifier?: string };
}

type LoaderFn = (this: LoaderContext, code: string, inputSourceMap?: unknown) => void;

// One factory-built loader per import specifier. The specifier is a per-rule
// (JSON) loader option, but the transforms capturing it must be baked in at
// module scope — so bind lazily and cache, keyed by specifier. In practice a
// build uses a single specifier, so this holds one entry.
const loaders = new Map<string | undefined, LoaderFn>();

function loaderFor(importSpecifier: string | undefined): LoaderFn {
  let loader = loaders.get(importSpecifier);
  if (!loader) {
    loader = createLoader({ customTransforms: moduleInjectedTransforms(importSpecifier) }) as LoaderFn;
    loaders.set(importSpecifier, loader);
  }
  return loader;
}

/**
 * Reads the Sentry-specific `importSpecifier` option (unknown to the upstream
 * loader, which reads only its own fields) and delegates to the matching
 * factory-built loader. `instrumentations` stays a plain per-rule loader
 * option, read by the upstream loader itself.
 */
const codeTransformerLoader: LoaderFn = function (code, inputSourceMap) {
  return loaderFor(this.getOptions().importSpecifier).call(this, code, inputSourceMap);
};

export default codeTransformerLoader;
