// Shared source of truth for the runtime globals the build-time (bundler) injection uses to
// announce itself. Kept dependency-free so the Turbopack loader can import it in the build process
// without pulling in the SDK runtime. The matching runtime side lives in `../instrumentation.ts`
// (the `__SENTRY_ORCHESTRION_ON_INJECT__` bridge) and `../detect.ts` (`__SENTRY_ORCHESTRION__`).

/**
 * Prologue appended to every module the bundler actually instruments. It runs when the module is
 * first loaded — for lazily-loaded server deps that is during request handling, after `Sentry.init()`
 * — and does two things: records the module in `__SENTRY_ORCHESTRION__.bundler` (so detection/reporting
 * see it) and calls the SDK bridge so channel subscribers get wired up before the module publishes.
 *
 * This exists because some bundlers (notably Turbopack) accept only loaders, not plugins, so there is
 * no build lifecycle hook to emit the aggregate module list at boot the way the webpack plugin does.
 * Announcing per-module on load mirrors how the runtime module hook already reports injected modules.
 *
 * Emitted as a single line (no newlines) so it never shifts the module's source-map mappings, and
 * wrapped in try/catch so an injection failure can never break the instrumented module.
 */
export function buildInjectPrologue(moduleName: string): string {
  const name = JSON.stringify(moduleName);
  return (
    ';(function(){try{' +
    'var g=(globalThis.__SENTRY_ORCHESTRION__=globalThis.__SENTRY_ORCHESTRION__||{});' +
    'g.bundler=g.bundler||[];' +
    `if(g.bundler.indexOf(${name})===-1)g.bundler.push(${name});` +
    'var cb=globalThis.__SENTRY_ORCHESTRION_ON_INJECT__;' +
    `if(typeof cb==="function")cb(${name});` +
    '}catch(e){}})();'
  );
}

/**
 * Boot-time snippet for bundlers that expose a build lifecycle hook (webpack/rollup/vite/esbuild via
 * the `injectDiagnostics` plugin option). Unlike Turbopack — where {@link buildInjectPrologue} runs
 * per-module as each loads — this runs once at bundle boot with the full list of transformed modules.
 *
 * It records the list in `__SENTRY_ORCHESTRION__.bundler` (so detection/reporting see it) AND calls
 * the SDK bridge for each module. The bridge call is essential: when `Sentry.init()` runs before this
 * snippet (e.g. loaded via `--require` ahead of the bundled server), the channel integrations have
 * already set up and are waiting on `orchestrion.module-runtime-injected`; without the bridge call
 * they never wire up their subscribers and no spans are recorded. Setting `.bundler` alone only covers
 * the reverse ordering (snippet before init), where init's own detection check picks it up.
 */
export function buildInjectBootSnippet(moduleNames: string[]): string {
  const names = JSON.stringify(moduleNames);
  return (
    ';(function(){try{' +
    'var g=(globalThis.__SENTRY_ORCHESTRION__=globalThis.__SENTRY_ORCHESTRION__||{});' +
    `var m=${names};` +
    'g.bundler=m;' +
    'var cb=globalThis.__SENTRY_ORCHESTRION_ON_INJECT__;' +
    'if(typeof cb==="function")for(var i=0;i<m.length;i++)cb(m[i]);' +
    '}catch(e){}})();'
  );
}
