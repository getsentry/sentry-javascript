import type { Attachment } from '@sentry/types';
import type {
  FeedbackCallbacks,
  FeedbackGeneralConfiguration,
  FeedbackTextConfiguration,
  FeedbackThemeConfiguration,
} from './config';
import type { FeedbackTheme } from './theme';

export type { FeedbackFormData } from './form';

export {
  FeedbackCallbacks,
  FeedbackGeneralConfiguration,
  FeedbackTextConfiguration,
  FeedbackThemeConfiguration,
  FeedbackTheme,
};

export interface FeedbackThemes {
  themeDark: FeedbackTheme;
  themeLight: FeedbackTheme;
}

/**
 * The integration's internal `options` member where every value should be set
 */
export interface FeedbackInternalOptions
  extends FeedbackGeneralConfiguration,
    FeedbackThemeConfiguration,
    FeedbackTextConfiguration,
    FeedbackCallbacks {}

/**
 * Partial configuration that overrides default configuration values
 */
export interface OptionalFeedbackConfiguration
  extends Omit<Partial<FeedbackInternalOptions>, 'themeLight' | 'themeDark'> {
  themeLight?: Partial<FeedbackTheme>;
  themeDark?: Partial<FeedbackTheme>;
}

export interface SendFeedbackParams {
  message: string;
  name?: string;
  email?: string;
  attachments?: Attachment[];
  url?: string;
  source?: string;
}

export interface SendFeedbackOptions {
  /**
   * Should include replay with the feedback?
   */
  includeReplay?: boolean;
}
