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
    name: 'FeedbackModal' as const,
    setupOnce() {},
    createDialog: ({ options, screenshotIntegration, sendFeedback, shadow }) => {
      const shadowRoot = shadow as ShadowRoot;
      const userKey = options.useSentryUser;
      const user = getUser();

      const el = DOCUMENT.createElement('div');
      const style = createDialogStyles(options.styleNonce);

      let originalOverflow = '';
      let isOpen = false;
      let previousFocus: Element | null = null;

      const restoreFocus = (): void => {
        const target = previousFocus;
        // The launcher is shown by the close/submitted callback after the dialog closes.
        void Promise.resolve().then(() => {
          if (!isOpen && target === previousFocus && target instanceof HTMLElement && target.isConnected) {
            target.focus();
          }
        });
      };
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
          dialog.close();
          render(null, el);
          el.remove();
          style.remove();
        },
        open() {
          if (isOpen) {
            return;
          }
          previousFocus = DOCUMENT.activeElement;
          while (previousFocus?.shadowRoot?.activeElement) {
            previousFocus = previousFocus.shadowRoot.activeElement;
          }
          originalOverflow = DOCUMENT.body.style.overflow;
          isOpen = true;
          renderContent(true);
          options.onFormOpen?.();
          getClient()?.emit('openFeedbackWidget');
          DOCUMENT.body.style.overflow = 'hidden';
        },
        close() {
          if (isOpen) {
            isOpen = false;
            DOCUMENT.body.style.overflow = originalOverflow;
          }
          renderContent(false);
          restoreFocus();
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
              dialog.close();
              options.onFormClose?.();
            }}
            onSubmit={sendFeedback}
            onSubmitSuccess={(data: FeedbackFormData, eventId: string) => {
              dialog.close();
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
