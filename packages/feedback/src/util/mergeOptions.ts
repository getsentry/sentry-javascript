import type { FeedbackFormData, FeedbackInternalOptions } from '@sentry/core';
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
    tags: {
      ...defaultOptions.tags,
      ...optionOverrides.tags,
    },
    onFormOpen: () => {
      optionOverrides.onFormOpen?.();
      defaultOptions.onFormOpen?.();
    },
    onFormClose: () => {
      optionOverrides.onFormClose?.();
      defaultOptions.onFormClose?.();
    },
    onSubmitSuccess: (data: FeedbackFormData, eventId: string) => {
      optionOverrides.onSubmitSuccess?.(data, eventId);
      defaultOptions.onSubmitSuccess?.(data, eventId);
    },
    onSubmitError: (error: Error) => {
      optionOverrides.onSubmitError?.(error);
      defaultOptions.onSubmitError?.(error);
    },
    onFormSubmitted: () => {
      optionOverrides.onFormSubmitted?.();
      defaultOptions.onFormSubmitted?.();
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
