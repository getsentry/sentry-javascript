import type { FeedbackFormData, FeedbackInternalOptions } from '@sentry/types';
import type { OptionalFeedbackConfiguration } from '../core/types';

/**
 * Quick and dirty deep merge for the Feedback integration options
 */
export function mergeOptions(
  defaultOptions: FeedbackInternalOptions,
  optionOverrides: OptionalFeedbackConfiguration,
): FeedbackInternalOptions {
  return {
    ...defaultOptions,
    ...optionOverrides,
    onFormOpen: () => {
      optionOverrides.onFormOpen && optionOverrides.onFormOpen();
      defaultOptions.onFormOpen && defaultOptions.onFormOpen();
    },
    onFormClose: () => {
      optionOverrides.onFormClose && optionOverrides.onFormClose();
      defaultOptions.onFormClose && defaultOptions.onFormClose();
    },
    onSubmitSuccess: (data: FeedbackFormData) => {
      optionOverrides.onSubmitSuccess && optionOverrides.onSubmitSuccess(data);
      defaultOptions.onSubmitSuccess && defaultOptions.onSubmitSuccess(data);
    },
    onSubmitError: (error: Error) => {
      optionOverrides.onSubmitError && optionOverrides.onSubmitError(error);
      defaultOptions.onSubmitError && defaultOptions.onSubmitError(error);
    },
    onFormSubmitted: () => {
      optionOverrides.onFormSubmitted && optionOverrides.onFormSubmitted();
      defaultOptions.onFormSubmitted && defaultOptions.onFormSubmitted();
    },
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
