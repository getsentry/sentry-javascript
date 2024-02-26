import { convertIntegrationFnToClass, defineIntegration, getCurrentScope } from '@sentry/core';
import type { Integration, IntegrationClass, IntegrationFn, IntegrationFnResult } from '@sentry/types';
import { h } from 'preact';
import type { sendFeedback as sendFeedbackFn } from '../core/sendFeedback';
import type { IFeedback2ScreenshotIntegration } from '../screenshot/integration';
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

  screenshotIntegration: IFeedback2ScreenshotIntegration | undefined;
}

interface PublicFeedback2ModalIntegration {
  createDialog: (props: CreateDialogProps) => DialogComponent;
}

export type IFeedback2ModalIntegration = IntegrationFnResult & PublicFeedback2ModalIntegration;

export const _feedback2ModalIntegration = (() => {
  return {
    name: 'Feedback2Modal',
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    createDialog({ shadow, sendFeedback, options, onDone, screenshotIntegration }: CreateDialogProps): DialogComponent {
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
    },
  };
}) satisfies IntegrationFn;

export const feedback2ModalIntegration = defineIntegration(_feedback2ModalIntegration);

/**
 * @deprecated Use `feedback2ModalIntegration()` instead
 */
// eslint-disable-next-line deprecation/deprecation
export const Feedback2Modal = convertIntegrationFnToClass(
  'Feedback2Modal',
  feedback2ModalIntegration,
) as IntegrationClass<Integration & PublicFeedback2ModalIntegration>;
