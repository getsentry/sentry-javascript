import type { PreprocessorGroup } from 'svelte/types/compiler/preprocess';

import { componentTrackingPreprocessor, defaultComponentTrackingOptions } from './preprocessors';
import type { SentryPreprocessorGroup, SentrySvelteConfigOptions, SvelteConfig } from './types';

const DEFAULT_SENTRY_OPTIONS: SentrySvelteConfigOptions = {
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
    ...DEFAULT_SENTRY_OPTIONS,
    ...sentryOptions,
  };

  const originalPreprocessors = getOriginalPreprocessorArray(originalConfig);

  // Map is insertion-order-preserving. It's important to add preprocessors
  // to this map in the right order we want to see them being executed.
  // see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
  const sentryPreprocessors = new Map<string, SentryPreprocessorGroup>();

  const shouldTrackComponents = mergedOptions.componentTracking && mergedOptions.componentTracking.trackComponents;
  if (shouldTrackComponents) {
    // TODO(v8): Remove eslint rule
    // eslint-disable-next-line deprecation/deprecation
    const firstPassPreproc: SentryPreprocessorGroup = componentTrackingPreprocessor(mergedOptions.componentTracking);
    sentryPreprocessors.set(firstPassPreproc.sentryId || '', firstPassPreproc);
  }

  // We prioritize user-added preprocessors, so we don't insert sentry processors if they
  // have already been added by users.
  originalPreprocessors.forEach((p: SentryPreprocessorGroup) => {
    if (p.sentryId) {
      sentryPreprocessors.delete(p.sentryId);
    }
  });

  const mergedPreprocessors = [...sentryPreprocessors.values(), ...originalPreprocessors];

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
