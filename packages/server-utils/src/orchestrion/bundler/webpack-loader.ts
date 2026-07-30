// The webpack/Turbopack code-transform loader, re-exported so it compiles into this
// package's build (the `@apm-js-collab` packages are bundled devDependencies and not resolvable on
// user installs). Bundlers reference it by on-disk path via `getOrchestrionLoaderPath()`, so it
// needs its own entrypoint/subpath rather than being reachable from another module.
import codeTransformerLoaderImpl from '@apm-js-collab/code-transformer-bundler-plugins/webpack-loader';

// Explicitly typed so the emitted declaration doesn't reference the bundled devDependency.
// (Nothing imports this subpath from TS — bundlers load it by file path — so the loose
// signature is never consumed.)
const codeTransformerLoader: (this: unknown, code: string, inputSourceMap?: unknown) => void =
  codeTransformerLoaderImpl;

export default codeTransformerLoader;
