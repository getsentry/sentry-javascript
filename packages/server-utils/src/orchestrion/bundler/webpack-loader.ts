// EXPERIMENTAL — the webpack/Turbopack code-transform loader, re-exported so it compiles into this
// package's build (the `@apm-js-collab` packages are bundled devDependencies and not resolvable on
// user installs). Bundlers reference it by on-disk path via `getOrchestrionLoaderPath()`, so it
// needs its own entrypoint/subpath rather than being reachable from another module.
import codeTransformerLoader from '@apm-js-collab/code-transformer-bundler-plugins/webpack-loader';

export default codeTransformerLoader;
