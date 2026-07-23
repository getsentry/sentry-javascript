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
   * instead (e.g. `@sentry/node`'s `experimentalUseDiagnosticsChannelInjection()`),
   * so the subscribers aren't registered twice.
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
 * app boot so the `_experimentalSetupOrchestrion()` detector can confirm the
 * bundler path ran (rather than relying on a build-time flag that wouldn't be
 * visible to the runtime).
 */
export function orchestrionTransformOptions(options: PluginOptions): CodeTransformerPluginOptions {
  const subscribeInjection = options.injectChannelSubscribers ? subscribeInjectionOptions() : undefined;

  const instrumentations = [
    ...SENTRY_INSTRUMENTATIONS,
    ...(options.instrumentations || []),
    ...(subscribeInjection?.instrumentations || []),
  ];
  const customTransforms = { ...options.customTransforms, ...subscribeInjection?.customTransforms };

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
      return `(globalThis.__SENTRY_ORCHESTRION__=globalThis.__SENTRY_ORCHESTRION__||{}).bundler=${JSON.stringify(diag.transformedModules)};`;
    },
  };
}
