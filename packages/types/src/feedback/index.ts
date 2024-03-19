import type { Event } from '../event';
import type { User } from '../user';

import type { ComponentType } from 'preact';
import type { Attachment } from '../attachment';
import type { IntegrationFnResult } from '../integration';
import type { TransportMakeRequestResponse } from '../transport';
import type {
  FeedbackCallbacks,
  FeedbackGeneralConfiguration,
  FeedbackTextConfiguration,
  FeedbackThemeConfiguration,
} from './config';
import type { FeedbackTheme } from './theme';

/**
 * Crash report feedback object
 */
export interface UserFeedback {
  event_id: string;
  email: User['email'];
  name: string;
  comments: string;
}

interface FeedbackContext extends Record<string, unknown> {
  message: string;
  contact_email?: string;
  name?: string;
  replay_id?: string;
  url?: string;
}

/**
 * NOTE: These types are still considered Alpha and subject to change.
 * @hidden
 */
export interface FeedbackEvent extends Event {
  type: 'feedback';
  contexts: Event['contexts'] & {
    feedback: FeedbackContext;
  };
}

export type SendFeedback = (
  props: SendFeedbackParams,
  opts: SendFeedbackOptions,
) => Promise<TransportMakeRequestResponse>;

interface PublicFeedbackIntegration {
  attachTo: (el: Element | string, optionOverrides: OverrideFeedbackConfiguration) => () => void;
  createWidget: (optionOverrides: OverrideFeedbackConfiguration & { shouldCreateActor?: boolean }) => Promise<Dialog>;
  getWidget: () => Dialog | null;
  remove: () => void;
  openDialog: () => void;
  closeDialog: () => void;
  removeWidget: () => void;
}
export type IFeedbackIntegration = IntegrationFnResult & PublicFeedbackIntegration;

interface DialogProps {
  options: FeedbackInternalOptions;
  screenshotIntegration: IFeedbackScreenshotIntegration | undefined;
  sendFeedback: SendFeedback;
  shadow: ShadowRoot;
}
export type CreateDialog = (props: DialogProps) => Dialog;
interface PublicFeedbackModalIntegration {
  createDialog: CreateDialog;
}
export type IFeedbackModalIntegration = IntegrationFnResult & PublicFeedbackModalIntegration;

export type CreateInput = (h: any, dialog: Dialog) => ScreenshotInput;
interface PublicFeedbackScreenshotIntegration {
  createInput: CreateInput;
}
export type IFeedbackScreenshotIntegration = IntegrationFnResult & PublicFeedbackScreenshotIntegration;

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

/**
 * Partial configuration that overrides default configuration values
 *
 * This is the config that gets passed into the integration constructor
 */
export type OverrideFeedbackConfiguration = Omit<Partial<FeedbackInternalOptions>, 'themeLight' | 'themeDark'>;

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

export interface Dialog {
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

export interface ScreenshotInput {
  /**
   * The preact component
   */
  input: ComponentType<{ onError: (error: Error) => void }>;

  /**
   * The image/screenshot bytes
   */
  value: () => Promise<Attachment | undefined>;
}
