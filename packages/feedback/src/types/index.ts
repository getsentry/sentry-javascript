import type { Attachment, Integration, SendFeedback } from '@sentry/types';
import type { VNode, h as HType } from 'preact';

export type { FeedbackFormData } from './form';

import type {
  FeedbackCallbacks,
  FeedbackGeneralConfiguration,
  FeedbackTextConfiguration,
  FeedbackThemeConfiguration,
} from './config';

/**
 * The integration's internal `options` member where every value should be set
 */
export interface FeedbackInternalOptions
  extends FeedbackGeneralConfiguration,
    FeedbackThemeConfiguration,
    FeedbackTextConfiguration,
    FeedbackCallbacks {}

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

export interface CreateDialogProps {
  options: FeedbackInternalOptions;
  screenshotIntegration: FeedbackScreenshotIntegration | undefined;
  sendFeedback: SendFeedback;
  shadow: ShadowRoot;
}
export interface FeedbackModalIntegration extends Integration {
  createDialog: (props: CreateDialogProps) => FeedbackDialog;
}

export interface FeedbackScreenshotIntegration extends Integration {
  createInput: (
    h: HType,
    dialog: FeedbackDialog,
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
