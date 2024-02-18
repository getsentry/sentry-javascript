// import * as ScreenshotIntegration from '@sentry-internal/feedback-screenshot';
// biome-ignore lint/nursery/noUnusedImports: reason
import { h, render } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { WINDOW } from '../constants';
import type { DialogComponent } from '../types';
import { DialogContent } from './components/DialogContent';
import type { Props as DialogContentProps } from './components/DialogContent';

interface Props extends Omit<DialogContentProps, 'errorMessage'> {
  onClosed: () => void;
}

/**
 * Feedback dialog component that has the form
 */
export function Dialog({ onClosed, onCancel, onSubmit, ...dialogContentProps }: Props): DialogComponent {
  const doc = WINDOW.document;
  let errorMessage: string | undefined = undefined;

  /**
   * The <dialog> is the full width & height semi-transparent bg behind the <form>.
   * Clicks on the <dialog>, outside the <form>, will hide the <dialog> and it's content.
   */
  const dialog = doc.createElement('dialog');
  dialog.className = 'dialog';
  dialog.addEventListener('click', onClosed);

  /**
   * Close the dialog
   */
  function close(): void {
    dialog.open = false;
  }

  /**
   * Open the dialog
   */
  function open(): void {
    dialog.open = true;
  }

  /**
   * Check if dialog is currently opened
   */
  function checkIsOpen(): boolean {
    return dialog.open === true;
  }

  function renderDialogContent(): void {
    dialog.open = true;

    render(
      <DialogContent onSubmit={onSubmit} onCancel={onCancel} errorMessage={errorMessage} {...dialogContentProps} />,
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
      renderDialogContent();
    },
    hideError: () => {
      errorMessage = undefined;
      renderDialogContent();
    },
    open,
    close,
    checkIsOpen,
  };
}
