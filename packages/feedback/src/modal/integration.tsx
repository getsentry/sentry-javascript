import { getCurrentScope } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
// biome-ignore lint/nursery/noUnusedImports: reason
import { h, render } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { DOCUMENT } from '../constants';
import type { CreateDialogProps, FeedbackFormData, FeedbackModalIntegration } from '../types';
import { Dialog } from './components/Dialog';
import { createDialogStyles } from './components/Dialog.css';

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

      let originalOverflow = '';
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
          originalOverflow = DOCUMENT.body.style.overflow;
          DOCUMENT.body.style.overflow = 'hidden';
        },
        close() {
          renderContent(false);
          DOCUMENT.body.style.overflow = originalOverflow;
        },
      };

      const screenshotInput = screenshotIntegration && screenshotIntegration.createInput(dialog);

      const renderContent = (open: boolean): void => {
        render(
          <Dialog
            screenshotInput={screenshotInput}
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
