import type { Attachment } from '../attachment';
import type { Integration } from '../integration';

import type {
  FeedbackCallbacks,
  FeedbackGeneralConfiguration,
  FeedbackTextConfiguration,
  FeedbackThemeConfiguration,
} from './config';

export type { FeedbackFormData } from './form';

import type {
  FeedbackEvent,
  SendFeedback,
  SendFeedbackOptions,
  SendFeedbackParams,
  UserFeedback,
} from './sendFeedback';
export type { FeedbackEvent, SendFeedback, SendFeedbackOptions, SendFeedbackParams, UserFeedback };

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
  themeLight?: Partial<FeedbackInternalOptions['themeLight']>;
  themeDark?: Partial<FeedbackInternalOptions['themeLight']>;
}

/**
 * Partial configuration that overrides the constructor provided configuration values
 *
 * This is the config that gets passed into methods like attachTo and createWidget.
 */
export type OverrideFeedbackConfiguration = Omit<Partial<FeedbackInternalOptions>, 'themeLight' | 'themeDark'>;

type HTMLElement = unknown;
export interface FeedbackDialog {
  /**
   * The HTMLElement that is containing all the form content
   */
  el: HTMLElement;

  /**
   * Insert the Dialog into the Shadow DOM.
   *
   * The Dialog starts in the `closed` state where no inner HTML is rendered.
   */
  appendToDom: () => void;

  /**
   * Remove the dialog from the Shadow DOM
   */
  removeFromDom: () => void;

  /**
   * Open/Show the dialog & form inside it
   */
  open: () => void;

  /**
   * Close/Hide the dialog & form inside it
   */
  close: () => void;
}

type ShadowRoot = unknown;
export interface CreateDialogProps {
  options: FeedbackInternalOptions;
  screenshotIntegration: FeedbackScreenshotIntegration | undefined;
  sendFeedback: SendFeedback;
  shadow: ShadowRoot;
}
export interface FeedbackModalIntegration extends Integration {
  createDialog: (props: CreateDialogProps) => FeedbackDialog;
}

type HType = unknown;
type VNode = unknown;
export interface FeedbackScreenshotIntegration extends Integration {
  createInput: (
    h: HType,
    dialog: FeedbackDialog,
    options: FeedbackInternalOptions,
  ) => {
    /**
     * The preact component
     */
    input: (props: { onError: (error: Error) => void }) => VNode;

    /**
     * The image/screenshot bytes
     */
    value: () => Promise<Attachment | undefined>;
  };
}
