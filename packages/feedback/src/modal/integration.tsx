import { getCurrentScope } from '@sentry/core';
import type { CreateDialogProps, FeedbackFormData, FeedbackModalIntegration, IntegrationFn } from '@sentry/types';
import { h, render } from 'preact';
import { DOCUMENT } from '../constants';
import { createDialogStyles } from './components/Dialog.css';
import { DialogComponent } from './components/DialogContainer';

export const feedbackModalIntegration = ((): FeedbackModalIntegration => {
  return {
    name: 'FeedbackModal',
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    createDialog: ({ options, screenshotIntegration, sendFeedback, shadow }: CreateDialogProps) => {
      const shadowRoot = shadow as unknown as ShadowRoot;
      const userKey = options.useSentryUser;
      const scope = getCurrentScope();
      const user = scope && scope.getUser();

      const el = DOCUMENT.createElement('div');
      const style = createDialogStyles();

      const dialog = {
        get el() {
          return el;
        },
        appendToDom(): void {
          if (!shadowRoot.contains(style) && !shadowRoot.contains(el)) {
            shadowRoot.appendChild(style);
            shadowRoot.appendChild(el);
          }
        },
        removeFromDom(): void {
          shadowRoot.removeChild(el);
          shadowRoot.removeChild(style);
        },
        open() {
          renderContent(true);
          options.onFormOpen && options.onFormOpen();
        },
        close() {
          renderContent(false);
        },
      };

      const screenshotInput = screenshotIntegration && screenshotIntegration.createInput(h, dialog);

      const renderContent = (open: boolean): void => {
        render(
          <DialogComponent
            screenshotInput={screenshotInput}
            colorScheme={options.colorScheme}
            showBranding={options.showBranding}
            showName={options.showName || options.isNameRequired}
            showEmail={options.showEmail || options.isEmailRequired}
            isNameRequired={options.isNameRequired}
            isEmailRequired={options.isEmailRequired}
            formTitle={options.formTitle}
            cancelButtonLabel={options.cancelButtonLabel}
            submitButtonLabel={options.submitButtonLabel}
            emailLabel={options.emailLabel}
            emailPlaceholder={options.emailPlaceholder}
            messageLabel={options.messageLabel}
            messagePlaceholder={options.messagePlaceholder}
            nameLabel={options.nameLabel}
            namePlaceholder={options.namePlaceholder}
            defaultName={(userKey && user && user[userKey.name]) || ''}
            defaultEmail={(userKey && user && user[userKey.email]) || ''}
            successMessageText={options.successMessageText}
            isRequiredText={options.isRequiredText}
            onFormClose={() => {
              renderContent(false);
              options.onFormClose && options.onFormClose();
            }}
            onSubmit={sendFeedback}
            onSubmitSuccess={(data: FeedbackFormData) => {
              renderContent(false);
              options.onSubmitSuccess && options.onSubmitSuccess(data);
            }}
            onSubmitError={(error: Error) => {
              options.onSubmitError && options.onSubmitError(error);
            }}
            onFormSubmitted={() => {
              options.onFormSubmitted && options.onFormSubmitted();
            }}
            open={open}
          />,
          el,
        );
      };

      return dialog;
    },
  };
}) satisfies IntegrationFn;
