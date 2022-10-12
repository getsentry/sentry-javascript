import { CompileOptions } from 'svelte/types/compiler';
import { PreprocessorGroup } from 'svelte/types/compiler/preprocess';

import { componentTrackingPreprocessor, defaultComponentTrackingOptions } from './preprocessors';
import { ComponentTrackingInitOptions, SentryPreprocessorGroup } from './types';

export type SvelteConfig = {
  [key: string]: unknown;
  preprocess?: PreprocessorGroup[] | PreprocessorGroup;
  compilerOptions?: CompileOptions;
};

export type SentrySvelteConfigOptions = {
  componentTracking?: ComponentTrackingInitOptions;
};

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
  const sentryPreprocessors: SentryPreprocessorGroup[] = [];

  const shouldTrackComponents = mergedOptions.componentTracking && mergedOptions.componentTracking.trackComponents;
  if (shouldTrackComponents) {
    // TODO(v8): Remove eslint rule
    // eslint-disable-next-line deprecation/deprecation
    sentryPreprocessors.push(componentTrackingPreprocessor(mergedOptions.componentTracking));
  }

  const dedupedSentryPreprocessors = sentryPreprocessors.filter(
    sentryPreproc =>
      originalPreprocessors.find(p => (p as SentryPreprocessorGroup).id === sentryPreproc.id) === undefined,
  );

  const mergedPreprocessors = [...dedupedSentryPreprocessors, ...originalPreprocessors];

  return {
    ...originalConfig,
    preprocess: mergedPreprocessors,
  };
}

/**
 * Standardizes the different ways the user-provided preprocessor option can be specified.
 * Users can specify an array of preprocessors, one single one or nothing at all.
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
