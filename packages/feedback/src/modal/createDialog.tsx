import { getCurrentScope } from '@sentry/core';
import { h, render } from 'preact';
import { DOCUMENT } from '../constants';
import type { sendFeedback as sendFeedbackFn } from '../core/sendFeedback';
import type { IFeedbackScreenshotIntegration } from '../screenshot/integration';
import type { Dialog, FeedbackFormData, FeedbackInternalOptions } from '../types';
import { createDialogStyles } from './components/Dialog.css';
import { DialogComponent } from './components/DialogContainer';

interface Props {
  options: FeedbackInternalOptions;
  screenshotIntegration: IFeedbackScreenshotIntegration | undefined;
  sendFeedback: typeof sendFeedbackFn;
  shadow: ShadowRoot;
}

export function createDialog({ options, screenshotIntegration, sendFeedback, shadow }: Props): Dialog {
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
      if (!shadow.contains(style) && !shadow.contains(el)) {
        shadow.appendChild(style);
        shadow.appendChild(el);
      }
    },
    removeFromDom(): void {
      shadow.removeChild(el);
      shadow.removeChild(style);
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
}
