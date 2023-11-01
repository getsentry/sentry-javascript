import type { FeedbackInternalOptions, OptionalFeedbackConfiguration } from '../types';

/**
 *
 */
export function mergeOptions(
  defaultOptions: FeedbackInternalOptions,
  optionOverrides: OptionalFeedbackConfiguration,
): FeedbackInternalOptions {
  return {
    ...defaultOptions,
    ...optionOverrides,
    themeDark: {
      ...defaultOptions.themeDark,
      ...optionOverrides.themeDark,
    },
    themeLight: {
      ...defaultOptions.themeLight,
      ...optionOverrides.themeLight,
    },
  };
}
