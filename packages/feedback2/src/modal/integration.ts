import { getCurrentScope } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';
import { isBrowser } from '@sentry/utils';
import type { FeedbackFormData, FeedbackInternalOptions } from '../types';
import type { SendFeedbackOptions, SendFeedbackParams } from '../types';
import { Dialog } from './components/Dialog';
import type { DialogComponent } from './components/Dialog';

export interface DialogLifecycleCallbacks {
  /**
   * When the dialog is created.
   *
   * By default it is not in the 'open' state
   */
  onCreate: (dialog: DialogComponent) => void;

  /**
   * When the data is ready to be submitted
   */
  onSubmit: (data: SendFeedbackParams, options?: SendFeedbackOptions) => void;

  /**
   * When the dialog is either closed, or was submitted successfully, and nothing is rendered anymore.
   *
   * This is called after onFormClose OR onSubmitSuccess
   */
  onDone: (dialog: DialogComponent) => void;
}

export const feedback2ModalIntegration = (() => {
  // eslint-disable-next-line deprecation/deprecation
  return new Feedback2Modal();
}) satisfies IntegrationFn;

/**
 * TODO
 *
 * @deprecated Use `feedbackIntegration()` instead.
 */
export class Feedback2Modal implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Feedback2Modal';

  /**
   * @inheritDoc
   */
  public name: string;

  protected _dialog: DialogComponent | null;

  public constructor() {
    // eslint-disable-next-line deprecation/deprecation
    this.name = Feedback2Modal.id;

    this._dialog = null;
  }

  /**
   * Setup and initialize feedback container
   */
  public setupOnce(): void {
    if (!isBrowser()) {
      return;
    }

    // listen for the createDialog call?
    // does that make it totally private, i guess sdk hackers can call emit() themselves :(
  }

  /**
   *
   */
  public renderDialog(options: FeedbackInternalOptions, callbacks: DialogLifecycleCallbacks): void {
    if (!this._dialog) {
      const userKey = options.useSentryUser;
      const scope = getCurrentScope();
      const user = scope && scope.getUser();

      // TODO: options may have changed?
      const dialog = Dialog({
        colorScheme: options.colorScheme,
        showBranding: options.showBranding,
        showName: options.showName || options.isNameRequired,
        showEmail: options.showEmail || options.isEmailRequired,
        isNameRequired: options.isNameRequired,
        isEmailRequired: options.isEmailRequired,
        formTitle: options.formTitle,
        cancelButtonLabel: options.cancelButtonLabel,
        submitButtonLabel: options.submitButtonLabel,
        emailLabel: options.emailLabel,
        emailPlaceholder: options.emailPlaceholder,
        messageLabel: options.messageLabel,
        messagePlaceholder: options.messagePlaceholder,
        nameLabel: options.nameLabel,
        namePlaceholder: options.namePlaceholder,
        defaultName: (userKey && user && user[userKey.name]) || '',
        defaultEmail: (userKey && user && user[userKey.email]) || '',
        successMessageText: options.successMessageText,
        onFormClose: () => {
          callbacks.onDone(dialog);
          options.onFormClose && options.onFormClose();
        },
        onSubmit: callbacks.onSubmit,
        onSubmitSuccess: (data: FeedbackFormData) => {
          options.onSubmitSuccess && options.onSubmitSuccess(data);
        },
        onSubmitError: () => {
          options.onSubmitError && options.onSubmitError();
        },
        onDone: () => {
          callbacks.onDone(dialog);
        },
      });
      this._dialog = dialog;
    }

    callbacks.onCreate(this._dialog);
    options.onFormOpen && options.onFormOpen();
  }
}
