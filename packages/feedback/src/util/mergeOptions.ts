import { FeedbackInternalOptions, OptionalFeedbackConfiguration } from "../types";

export function mergeOptions(defaultOptions: FeedbackInternalOptions, optionOverrides: OptionalFeedbackConfiguration) {
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
    }
  };

}
