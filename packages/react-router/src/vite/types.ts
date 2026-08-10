import type { BuildTimeOptionsBase, UnstableVitePluginOptions } from '@sentry/core';
import type { SentryVitePluginOptions } from '@sentry/bundler-plugins/vite';

export type SentryReactRouterBuildOptions = BuildTimeOptionsBase &
  UnstableVitePluginOptions<Partial<SentryVitePluginOptions>> & {
    /**
     * Options related to react component name annotations.
     * Disabled by default, unless a value is set for this option.
     * When enabled, your app's DOM will automatically be annotated during build-time with their respective component names.
     * This will unlock the capability to search for Replays in Sentry by component name, as well as see component names in breadcrumbs and performance monitoring.
     * Please note that this feature is not currently supported by the esbuild bundler plugins, and will only annotate React components
     */
    reactComponentAnnotation?: {
      /**
       * Whether the component name annotate plugin should be enabled or not.
       */
      enabled?: boolean;

      /**
       * A list of strings representing the names of components to ignore. The plugin will not apply `data-sentry` annotations on the DOM element for these components.
       */
      ignoredComponents?: string[];
    };
  };
