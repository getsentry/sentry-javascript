// import * as ScreenshotIntegration from '@sentry-internal/feedback-screenshot';
import { h, render } from 'preact';
import { WINDOW } from '../constants';
import type { DialogComponent } from '../types';
import { DialogContent } from './components/DialogContent';
import type { Props as DialogContentProps } from './components/DialogContent';

interface Props extends Omit<DialogContentProps, 'errorMessage' | 'errorClass'> {
  onClosed?: () => void;
}

/**
 * Feedback dialog component that has the form
 */
export function Dialog({ onClosed, onCancel, onSubmit, ...dialogContentProps }: Props): DialogComponent {
  let dialog: HTMLDialogElement | null = null;
  let errorMessage: string | undefined = undefined;

  /**
   * Handles when the dialog is clicked. In our case, the dialog is the
   * semi-transparent bg behind the form. We want clicks outside of the form to
   * hide the form.
   */
  function handleDialogClose(): void {
    close();

    // Only this should trigger `onClose`, we don't want the `close()` method to
    // trigger it, otherwise it can cause cycles.
    onClosed && onClosed();
  }

  /**
   * Close the dialog
   */
  function close(): void {
    if (dialog) {
      dialog.open = false;
    }
  }

  /**
   * Opens the dialog
   */
  function open(): void {
    if (dialog) {
      dialog.open = true;
    }
  }

  /**
   * Check if dialog is currently opened
   */
  function checkIsOpen(): boolean {
    return (dialog && dialog.open === true) || false;
  }

  function renderDialogContent(): void {
    if (!dialog) {
      const doc = WINDOW.document;
      dialog = doc.createElement('dialog');
      dialog.addEventListener('click', handleDialogClose);
      dialog.className = 'dialog';
      dialog.open = true;
    }

    render(
      <DialogContent
        onSubmit={(data): void => {
          close();
          onSubmit && onSubmit(data);
        }}
        onCancel={(e): void => {
          close();
          onCancel && onCancel(e);
        }}
        errorMessage={errorMessage}
        {...dialogContentProps}
      />,
      dialog,
    );
  }

  renderDialogContent();

  return {
    get el() {
      return dialog;
    },
    showError: (message: string) => {
      errorMessage = message;
    },
    hideError: () => {
      errorMessage = undefined;
    },
    open,
    close,
    checkIsOpen,
  };
}
