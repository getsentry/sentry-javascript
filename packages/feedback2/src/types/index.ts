import type { Attachment } from '@sentry/types';
import type { ComponentType } from 'preact';
import type { Props as ScreenshotToggleProps } from '../screenshot/components/ScreenshotToggle';
import type {
  FeedbackCallbacks,
  FeedbackGeneralConfiguration,
  FeedbackTextConfiguration,
  FeedbackThemeConfiguration,
} from './config';
import type { FeedbackTheme } from './theme';

export type { FeedbackFormData } from './form';

export { FeedbackTheme };
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
 *
 * This is the config that gets passed into the integration constructor
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

export interface ScreenshotWidget {
  style: HTMLStyleElement;
  input: ComponentType;
  toggle: ComponentType<ScreenshotToggleProps>;
  value: () => Promise<Attachment | undefined>;
}
