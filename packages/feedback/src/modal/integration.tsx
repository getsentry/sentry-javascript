import { getCurrentScope, getGlobalScope, getIsolationScope } from '@sentry/core';
import type { CreateDialogProps, FeedbackFormData, FeedbackModalIntegration, IntegrationFn } from '@sentry/types';
import { h, render } from 'preact';
import { DOCUMENT } from '../constants';
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
      const user = getCurrentScope().getUser() || getIsolationScope().getUser() || getGlobalScope().getUser();

      const el = DOCUMENT.createElement('div');
      const style = createDialogStyles(options);

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

      const screenshotInput = screenshotIntegration && screenshotIntegration.createInput(h, dialog, options);

      const renderContent = (open: boolean): void => {
        render(
          <Dialog
            options={options}
            screenshotInput={screenshotInput}
            showName={options.showName || options.isNameRequired}
            showEmail={options.showEmail || options.isEmailRequired}
            defaultName={(userKey && user && user[userKey.name]) || ''}
            defaultEmail={(userKey && user && user[userKey.email]) || ''}
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
