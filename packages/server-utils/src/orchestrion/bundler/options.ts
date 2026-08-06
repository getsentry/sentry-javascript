import type { InstrumentationConfig, CustomTransform } from '..';
import { SENTRY_INSTRUMENTATIONS } from '../config';
import { subscribeInjectionOptions } from './subscribeInjection';
import type { CodeTransformerPluginOptions } from '../apmTypes';

export type PluginOptions = {
  /**
   * Additional instrumentations to include with the default instrumentation.
   */
  instrumentations?: InstrumentationConfig[];
  /**
   * Automatic instrumentation of server-side dependencies at build time.
   *
   * Set to `false` to make the plugin inert, so no instrumentation code is injected.
   *
   * @default true
   */
  buildTimeInstrumentation?: boolean;
  /**
   * Custom transforms that can be applied using the `transform` option in each `InstrumentationConfig`.
   */
  customTransforms?: Record<string, CustomTransform>;
  /**
   * Whether to inject the global diagnostics.
   *
   * Defaults to `true`.
   */
  shouldInjectDiagnostics?: boolean;
  /**
   * Inject a small marker-push into each instrumented module that imports only
   * that package's channel-subscriber factory and pushes it onto
   * `globalThis.__SENTRY_ORCHESTRION__.integrations`. A bundler-only SDK reads
   * the marker at `init()` and instantiates the collected factories, so every
   * transformed package's subscriber is wired up with no runtime module hook.
   *
   * Because each site imports a single named factory, it tree-shakes: a bundle
   * carries subscriber code only for the packages actually transformed into it.
   *
   * This is what lets a bundler-only SDK (e.g. `@sentry/cloudflare`, which runs
   * in workerd where requires can't be monkey-patched) record channel spans,
   * but it is bundler-agnostic: any orchestrion bundler plugin can enable it.
   * Leave it off for SDKs that wire the integrations up through a static import
   * instead (e.g. `@sentry/node`, which registers them at init time), so the
   * subscribers aren't registered twice.
   *
   * Defaults to `false`.
   */
  injectChannelSubscribers?: boolean;
};

/**
 * Whether an "external" config entry covers an instrumented module: an exact
 * package name (`'mysql'`) or a subpath (`'mysql/lib/...'`) — the transform may
 * target exactly the file a subpath entry externalizes. Mirrors the matching in
 * `withoutInstrumentedExternals`.
 */
export function externalEntryMatchesModule(entry: string, moduleName: string): boolean {
  return entry === moduleName || entry.startsWith(`${moduleName}/`);
}

/**
 * Warning emitted when a bundler config externalizes packages that orchestrion
 * needs to transform. An externalized dependency is resolved from
 * `node_modules` at runtime and never passes through the code transform, so
 * its diagnostics_channel calls are silently never injected.
 */
export function externalizedModulesWarning(externalizedModules: string[]): string {
  return (
    `The following packages are marked as external in your bundler configuration but need to be bundled for Sentry ` +
    `instrumentation to work: ${externalizedModules.join(', ')}. Remove them from your bundler's "external" ` +
    `configuration, or use the Sentry Node SDK's runtime instrumentation instead.`
  );
}

/**
 * The `@apm-js-collab/code-transformer-bundler-plugins` options shared by every
 * orchestrion bundler plugin.
 *
 * `injectDiagnostics` sets `globalThis.__SENTRY_ORCHESTRION__.bundler = ["mysql"]` at
 * app boot so the `detectOrchestrionSetup()` detector can confirm the
 * bundler path ran (rather than relying on a build-time flag that wouldn't be
 * visible to the runtime).
 */
export function orchestrionTransformOptions(options: PluginOptions): CodeTransformerPluginOptions {
  const instrumentations = [...SENTRY_INSTRUMENTATIONS, ...(options.instrumentations || [])];
  const customTransforms = {
    ...options.customTransforms,
    ...(options.injectChannelSubscribers ? subscribeInjectionOptions().customTransforms : undefined),
  };

  if (options.shouldInjectDiagnostics === false) {
    return {
      instrumentations,
      customTransforms,
    };
  }

  return {
    instrumentations,
    customTransforms,
    injectDiagnostics: (diag: { transformedModules: string[]; failedModules: string[] }) => {
      // Record the transformed modules for detection AND fire the on-inject
      // bridge for each, so channel integrations subscribe. These modules are
      // bundled, so the runtime module hook never sees them. The bridge
      // (installed by `registerDiagnosticsChannelInjection`) re-emits the
      // `orchestrion.module-runtime-injected` event the subscription waits on.
      // When the bridge isn't installed (bundler-only runtimes, or the banner
      // runs before `init()`), the guarded call is a no-op and the recorded
      // `.bundler` list still drives subscription at `init()`.
      const modules = JSON.stringify(diag.transformedModules);
      return (
        '(function(){' +
        'var g=globalThis.__SENTRY_ORCHESTRION__=globalThis.__SENTRY_ORCHESTRION__||{};' +
        `var m=${modules};` +
        'g.bundler=m;' +
        "if(typeof g.onInject==='function')m.forEach(function(n){g.onInject(n);});" +
        '})();'
      );
    },
  };
}
