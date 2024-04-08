import type { Attachment } from '../attachment';
import type { Integration } from '../integration';

import type {
  FeedbackCallbacks,
  FeedbackGeneralConfiguration,
  FeedbackTextConfiguration,
  FeedbackThemeConfiguration,
} from './config';

export type { FeedbackFormData } from './form';

import type { FeedbackEvent, SendFeedback, SendFeedbackParams, UserFeedback } from './sendFeedback';
export type { FeedbackEvent, UserFeedback, SendFeedback, SendFeedbackParams };

/**
 * The integration's internal `options` member where every value should be set
 */
export interface FeedbackInternalOptions
  extends FeedbackGeneralConfiguration,
    FeedbackThemeConfiguration,
    FeedbackTextConfiguration,
    FeedbackCallbacks {}

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
