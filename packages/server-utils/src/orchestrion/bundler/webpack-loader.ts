// The webpack/Turbopack code-transform loader, re-exported so it compiles into this
// package's build (the `@apm-js-collab` packages are bundled devDependencies and not resolvable on
// user installs). Bundlers reference it by on-disk path via `getOrchestrionLoaderPath()`, so it
// needs its own entrypoint/subpath rather than being reachable from another module.
import codeTransformerLoaderImpl from '@apm-js-collab/code-transformer-bundler-plugins/webpack-loader';

// The loader context we rely on beyond the transform itself: `resourcePath` to
// name the module, `async` for the transformed result, and `_compilation` to
// tell webpack (present) from Turbopack (absent).
interface LoaderContext {
  resourcePath: string;
  async: () => (error: unknown, code?: string, map?: unknown) => void;
  _compilation?: unknown;
}

type LoaderFn = (this: LoaderContext, code: string, inputSourceMap?: unknown) => void;

const upstreamLoader: LoaderFn = codeTransformerLoaderImpl;

/**
 * The npm package name for a module path.
 * Reads the segment after the LAST `node_modules`, so pnpm's nested layout
 * resolves to the real package. Matches the name that channel integrations
 * await.
 */
function packageNameFromPath(resourcePath: string): string | undefined {
  const marker = '/node_modules/';
  const normalized = resourcePath.replace(/\\/g, '/');
  const index = normalized.lastIndexOf(marker);
  if (index === -1) {
    return undefined;
  }

  const [scopeOrName, name] = normalized.slice(index + marker.length).split('/');
  if (!scopeOrName) {
    return undefined;
  }

  return scopeOrName.startsWith('@') && name ? `${scopeOrName}/${name}` : scopeOrName;
}

/**
 * Announce a runtime-injected module the way the banner and runtime `--import`
 * hook do, so the lazily-registered channel integrations subscribe. Appended to
 * each transformed module's code, it runs when that module loads.
 */
function onInjectSnippet(moduleName: string): string {
  const name = JSON.stringify(moduleName);
  return (
    ';(function(){' +
    'var g=globalThis.__SENTRY_ORCHESTRION__=globalThis.__SENTRY_ORCHESTRION__||{};' +
    'if(!Array.isArray(g.bundler))g.bundler=[];' +
    `if(g.bundler.indexOf(${name})<0)g.bundler.push(${name});` +
    `if(typeof g.onInject==='function')g.onInject(${name});` +
    '})();\n'
  );
}

/**
 * Wraps the upstream code-transform loader.
 *
 * Under Turbopack the transform runs as a loader, but the webpack *plugin* that
 * emits the `injectDiagnostics` boot banner never runs, because Turbopack takes
 * loaders, not plugins. That banner is what calls `onInject` for bundled
 * modules, so without it the channel integrations never learn their module
 * loaded and never subscribe. When there is no webpack compilation (Turbopack
 * case), append the `onInject` call to each transformed module here instead.
 * Under webpack leave it to the banner, so signal fires exactly once per module
 */
const codeTransformerLoader: LoaderFn = function (code, inputSourceMap) {
  if (this._compilation) {
    upstreamLoader.call(this, code, inputSourceMap);
    return;
  }

  const realAsync = this.async.bind(this);
  const { resourcePath } = this;

  this.async = () => {
    const callback = realAsync();
    return (error: unknown, outputCode?: string, outputMap?: unknown): void => {
      // The upstream loader returns the input code unchanged when it did not
      // transform the module, so a changed string means a channel-publishing
      // module we must announce.
      const transformed = !error && typeof outputCode === 'string' && outputCode !== code;
      const moduleName = transformed ? packageNameFromPath(resourcePath) : undefined;
      const finalCode = moduleName ? `${outputCode}${onInjectSnippet(moduleName)}` : outputCode;
      callback(error, finalCode, outputMap);
    };
  };

  upstreamLoader.call(this, code, inputSourceMap);
};

export default codeTransformerLoader;
