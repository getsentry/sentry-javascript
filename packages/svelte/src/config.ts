import type { PreprocessorGroup } from 'svelte/types/compiler/preprocess';

import { componentTrackingPreprocessor, defaultComponentTrackingOptions } from './preprocessors';
import type { SentryPreprocessorGroup, SentrySvelteConfigOptions, SvelteConfig } from './types';

const defaultSentryOptions: SentrySvelteConfigOptions = {
  componentTracking: defaultComponentTrackingOptions,
};

/**
 * Add Sentry options to the Svelte config to be exported from the user's `svelte.config.js` file.
 *
 * @param originalConfig The existing config to be exported prior to adding Sentry
 * @param sentryOptions The configuration of the Sentry-added options
 *
 * @return The wrapped and modified config to be exported
 */
export function withSentryConfig(
  originalConfig: SvelteConfig,
  sentryOptions?: SentrySvelteConfigOptions,
): SvelteConfig {
  const mergedOptions = {
    ...defaultSentryOptions,
    ...sentryOptions,
    componentTracking: {
      ...defaultSentryOptions.componentTracking,
      ...sentryOptions?.componentTracking,
    },
  };

  const originalPreprocessors = getOriginalPreprocessorArray(originalConfig);

  // Bail if users already added the preprocessor
  if (originalPreprocessors.find((p: PreprocessorGroup) => !!(p as SentryPreprocessorGroup).sentryId)) {
    return originalConfig;
  }

  const mergedPreprocessors = [...originalPreprocessors];
  if (mergedOptions.componentTracking.trackComponents) {
    mergedPreprocessors.unshift(componentTrackingPreprocessor(mergedOptions.componentTracking));
  }

  return {
    ...originalConfig,
    preprocess: mergedPreprocessors,
  };
}

/**
 * Standardizes the different ways the user-provided preprocessor option can be specified.
 * Users can specify an array of preprocessors, a single one or no preprocessor.
 *
 * @param originalConfig the user-provided svelte config oject
 * @return an array of preprocessors or an empty array if no preprocessors were specified
 */
function getOriginalPreprocessorArray(originalConfig: SvelteConfig): PreprocessorGroup[] {
  if (originalConfig.preprocess) {
    if (Array.isArray(originalConfig.preprocess)) {
      return originalConfig.preprocess;
    }
    return [originalConfig.preprocess];
  }
  return [];
}
