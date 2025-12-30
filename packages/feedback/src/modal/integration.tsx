import type { FeedbackFormData, FeedbackModalIntegration, IntegrationFn, User } from '@sentry/core';
import { getClient, getCurrentScope, getGlobalScope, getIsolationScope } from '@sentry/core';
import { h, render } from 'preact';
import * as hooks from 'preact/hooks';
import { DOCUMENT } from '../constants';
import { Dialog } from './components/Dialog';
import { createDialogStyles } from './components/Dialog.css';

function getUser(): User | undefined {
  const currentUser = getCurrentScope().getUser();
  const isolationUser = getIsolationScope().getUser();
  const globalUser = getGlobalScope().getUser();
  if (currentUser && Object.keys(currentUser).length) {
    return currentUser;
  }
  if (isolationUser && Object.keys(isolationUser).length) {
    return isolationUser;
  }
  return globalUser;
}

export const feedbackModalIntegration = ((): FeedbackModalIntegration => {
  return {
    name: 'FeedbackModal',
    setupOnce() {},
    createDialog: ({ options, screenshotIntegration, sendFeedback, shadow }) => {
      const shadowRoot = shadow as ShadowRoot;
      const userKey = options.useSentryUser;
      const user = getUser();

      const el = DOCUMENT.createElement('div');
      const style = createDialogStyles(options.styleNonce);

      let originalOverflow = '';
      const dialog: ReturnType<FeedbackModalIntegration['createDialog']> = {
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
          el.remove();
          style.remove();
          DOCUMENT.body.style.overflow = originalOverflow;
        },
        open() {
          renderContent(true);
          options.onFormOpen?.();
          getClient()?.emit('openFeedbackWidget');
          originalOverflow = DOCUMENT.body.style.overflow;
          DOCUMENT.body.style.overflow = 'hidden';
        },
        close() {
          renderContent(false);
          DOCUMENT.body.style.overflow = originalOverflow;
        },
      };

      const screenshotInput = screenshotIntegration?.createInput({ h, hooks, dialog, options });

      const renderContent = (open: boolean): void => {
        render(
          <Dialog
            options={options}
            screenshotInput={screenshotInput}
            showName={options.showName || options.isNameRequired}
            showEmail={options.showEmail || options.isEmailRequired}
            defaultName={String((userKey && user?.[userKey.name]) || '')}
            defaultEmail={String((userKey && user?.[userKey.email]) || '')}
            onFormClose={() => {
              renderContent(false);
              options.onFormClose?.();
            }}
            onSubmit={sendFeedback}
            onSubmitSuccess={(data: FeedbackFormData, eventId: string) => {
              renderContent(false);
              options.onSubmitSuccess?.(data, eventId);
            }}
            onSubmitError={(error: Error) => {
              options.onSubmitError?.(error);
            }}
            onFormSubmitted={() => {
              options.onFormSubmitted?.();
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
