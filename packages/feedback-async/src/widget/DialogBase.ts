import { WINDOW } from '../constants';
import type { DialogComponent } from '../types';
import type { Props as DialogContentProps } from './components/DialogContent';

type ComponentProps = Omit<DialogContentProps, 'errorMessage'>;

export interface Props extends ComponentProps {
  renderDialog: (parent: HTMLElement, props: DialogContentProps) => void;
  onClosed: () => void;
}

/**
 * Base Feedback dialog component that has the form
 */
export function DialogBase({
  renderDialog,
  onClosed,
  onCancel,
  onSubmit,
  ...dialogContentProps
}: Props): DialogComponent {
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

    renderDialog(dialog, {
      onSubmit,
      onCancel,
      errorMessage,
      ...dialogContentProps,
    });
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
