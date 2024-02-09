import { convertIntegrationFnToClass, defineIntegration } from '@sentry/core';
import type { Integration, IntegrationClass, IntegrationFn } from '@sentry/types';
import { Hello } from './screenshotWidget';
import { GLOBAL_OBJ } from '@sentry/utils';
import { h, render } from 'preact';

interface FeedbackScreenshotOptions {
  el: Element;
  props: string;
}

export interface FeedbackScreenshotIntegrationOptions {
  el: Element;
  props: string;
}

const INTEGRATION_NAME = 'FeedbackScreenshot';
const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

/** Exported only for type safe tests. */
export const _feedbackScreenshotIntegration = ((options: Partial<FeedbackScreenshotOptions> = {}) => {
  return {
    name: INTEGRATION_NAME,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    getOptions(): FeedbackScreenshotIntegrationOptions {
      return { el: options.el || WINDOW.document.createElement('div'), props: options.props || 'prop' };
    },
    renderScreenshotWidget: (options: FeedbackScreenshotOptions) => {
      return render(h(Hello, null), options.el);
    },
  };
}) satisfies IntegrationFn;

/**
 * Add this in addition to `replayIntegration()` to enable canvas recording.
 */
export const feedbackScreenshotIntegration = defineIntegration(_feedbackScreenshotIntegration);

/**
 * @deprecated Use `feedbackScreenshotIntegration()` instead
 */
// eslint-disable-next-line deprecation/deprecation
export const FeedbackScreenshot = convertIntegrationFnToClass(
  INTEGRATION_NAME,
  feedbackScreenshotIntegration,
) as IntegrationClass<
  Integration & {
    getOptions: () => FeedbackScreenshotIntegrationOptions;
    renderScreenshotWidget: () => void;
  }
>;
