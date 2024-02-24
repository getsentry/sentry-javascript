import { getCurrentScope } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';
import { isBrowser } from '@sentry/utils';
import { h } from 'preact';
import type { Feedback2Screenshot } from '../screenshot/integration';
import type { FeedbackFormData, FeedbackInternalOptions, SendFeedbackOptions, SendFeedbackParams } from '../types';
import { Dialog } from './components/Dialog';
import type { DialogComponent } from './components/Dialog';

/**
 * Internal callbacks for pushing more form event code into the Feedback2Modal integration
 */
export interface DialogLifecycleCallbacks {
  /**
   * When the dialog is created.
   */
  onCreate: (dialog: DialogComponent) => void;

  /**
   * When the data is ready to be submitted
   */
  onSubmit: (data: SendFeedbackParams, options?: SendFeedbackOptions) => void;

  /**
   * When the dialog is either closed, or was submitted successfully, and nothing is rendered anymore.
   *
   * This is called as part of onFormClose and onFormSubmitted
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

  public constructor() {
    // eslint-disable-next-line deprecation/deprecation
    this.name = Feedback2Modal.id;
  }

  /**
   * Setup and initialize feedback container
   */
  public setupOnce(): void {
    if (!isBrowser()) {
      return;
    }

    // Nothing?
  }

  /**
   *
   */
  public createDialog(
    options: FeedbackInternalOptions,
    callbacks: DialogLifecycleCallbacks,
    // eslint-disable-next-line deprecation/deprecation
    screenshotIntegration: Feedback2Screenshot | undefined,
  ): DialogComponent {
    const userKey = options.useSentryUser;
    const scope = getCurrentScope();
    const user = scope && scope.getUser();

    const screenshotWidget = screenshotIntegration && screenshotIntegration.createWidget(h);

    const dialog = Dialog({
      screenshotWidget,
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
      onSubmitError: (error: Error) => {
        options.onSubmitError && options.onSubmitError(error);
      },
      onFormSubmitted: () => {
        callbacks.onDone(dialog);
        options.onFormSubmitted && options.onFormSubmitted();
      },
    });
    callbacks.onCreate(dialog);
    options.onFormOpen && options.onFormOpen();

    return dialog;
  }
}
