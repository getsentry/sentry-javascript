import { getCurrentScope } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';
import { isBrowser } from '@sentry/utils';
import { h } from 'preact';
import type { sendFeedback as sendFeedbackFn } from '../core/sendFeedback';
import type { Feedback2Screenshot } from '../screenshot/integration';
import type { FeedbackFormData, FeedbackInternalOptions } from '../types';
import { Dialog } from './components/Dialog';
import type { DialogComponent } from './components/Dialog';

interface CreateDialogProps {
  shadow: ShadowRoot;

  sendFeedback: typeof sendFeedbackFn;

  options: FeedbackInternalOptions;

  /**
   * When the dialog is either closed, or was submitted successfully, and nothing is rendered anymore.
   *
   * This is called as part of onFormClose and onFormSubmitted
   */
  onDone: () => void;

  // eslint-disable-next-line deprecation/deprecation
  screenshotIntegration: Feedback2Screenshot | undefined;
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
  public createDialog({
    shadow,
    sendFeedback,
    options,
    onDone,
    screenshotIntegration,
  }: CreateDialogProps): DialogComponent {
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
        shadow.removeChild(dialog.el);
        shadow.removeChild(dialog.style);
        screenshotWidget && shadow.removeChild(screenshotWidget.style);
        onDone();
        options.onFormClose && options.onFormClose();
      },
      onSubmit: sendFeedback,
      onSubmitSuccess: (data: FeedbackFormData) => {
        options.onSubmitSuccess && options.onSubmitSuccess(data);
      },
      onSubmitError: (error: Error) => {
        options.onSubmitError && options.onSubmitError(error);
      },
      onFormSubmitted: () => {
        shadow.removeChild(dialog.el);
        shadow.removeChild(dialog.style);
        screenshotWidget && shadow.removeChild(screenshotWidget.style);
        onDone();
        options.onFormSubmitted && options.onFormSubmitted();
      },
    });
    shadow.appendChild(dialog.style);
    screenshotWidget && shadow.appendChild(screenshotWidget.style);
    shadow.appendChild(dialog.el);
    options.onFormOpen && options.onFormOpen();

    return dialog;
  }
}
