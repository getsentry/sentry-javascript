import type { BuildTimeOptionsBase } from '@sentry/core';
import type { SentryVitePluginOptions } from '@sentry/bundler-plugins/vite';
import type { AutoInstrumentSelection } from './autoInstrument';
import type { SupportedSvelteKitAdapters } from './detectAdapter';

/** Options for the Custom Sentry Vite plugin */
export type CustomSentryVitePluginOptions = SentryVitePluginOptions & {
  adapter?: SupportedSvelteKitAdapters;
};

/** Options for the Sentry SvelteKit plugin */
export type SentrySvelteKitPluginOptions = BuildTimeOptionsBase & {
  /**
   * The Sentry plugin will automatically instrument certain parts of your SvelteKit application at build time.
   * Set this option to `false` to disable this behavior or what is intrumented by passing an object.
   *
   * Auto instrumentation includes:
   * - Universal `load` functions in `+page.(js|ts)` files
   * - Server-only `load` functions in `+page.server.(js|ts)` files
   *
   * @default true (meaning, the plugin will instrument all of the above)
   */
  autoInstrument?: boolean | AutoInstrumentSelection;

  /**
   * Specify which SvelteKit adapter you're using.
   * By default, the SDK will attempt auto-detect the used adapter at build time and apply the
   * correct config for source maps upload or auto-instrumentation.
   *
   * Currently, the SDK supports the following adapters:
   * - node (@sveltejs/adapter-node)
   * - auto (@sveltejs/adapter-auto) only Vercel
   * - vercel (@sveltejs/adapter-auto) only Serverless functions, no edge runtime
   *
   * Set this option, if the SDK detects the wrong adapter or you want to use an adapter
   * that is not in this list. If you specify 'other', you'll most likely need to configure
   * source maps upload yourself.
   *
   * @default {} the SDK attempts to auto-detect the used adapter at build time
   */
  adapter?: SupportedSvelteKitAdapters;

  /**
   * If this flag is `true`, the Sentry plugins will automatically upload source maps to Sentry.
   * @default true`.
   */
  autoUploadSourceMaps?: boolean;
};
