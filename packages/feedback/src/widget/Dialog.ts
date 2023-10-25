import type { FeedbackComponent, FeedbackConfigurationWithDefaults, FeedbackFormData } from '../types';
import { Form } from './Form';
import { createElement } from './util/createElement';

interface DialogProps {
  defaultName: string;
  defaultEmail: string;
  onCancel?: (e: Event) => void;
  onClosed?: () => void;
  onSubmit?: (feedback: FeedbackFormData) => void;
  options: FeedbackConfigurationWithDefaults;
}

export interface DialogComponent extends FeedbackComponent<HTMLDialogElement> {
  /**
   * Shows the error message
   */
  showError: (message: string) => void;

  /**
   * Hides the error message
   */
  hideError: () => void;

  /**
   * Disable submit button so that it cannot be clicked
   */
  setSubmitDisabled: () => void;

  /**
   * Enable submit buttons so that it can be clicked
   */
  setSubmitEnabled: () => void;

  /**
   * Opens and shows the dialog and form
   */
  open: () => void;

  /**
   * Closes the dialog and form
   */
  close: () => void;

  /**
   * Check if dialog is currently opened
   */
  checkIsOpen: () => boolean;
}

/**
 * Feedback dialog component that has the form
 */
export function Dialog({
  defaultName,
  defaultEmail,
  onClosed,
  onCancel,
  onSubmit,
  options,
}: DialogProps): DialogComponent {
  let el: HTMLDialogElement | null = null;

  /**
   * Handles when the dialog is clicked. In our case, the dialog is the
   * semi-transparent bg behind the form. We want clicks outside of the form to
   * hide the form.
   */
  function handleDialogClick(): void {
    close();

    // Only this should trigger `onClose`, we don't want the `close()` method to
    // trigger it, otherwise it can cause cycles.
    onClosed && onClosed();
  }

  /**
   * Close the dialog
   */
  function close(): void {
    if (el) {
      el.open = false;
    }
  }

  /**
   * Opens the dialog
   */
  function open(): void {
    if (el) {
      el.open = true;
    }
  }

  /**
   * Check if dialog is currently opened
   */
  function checkIsOpen(): boolean {
    return (el && el.open === true) || false;
  }

  const {
    el: formEl,
    setSubmitEnabled,
    setSubmitDisabled,
    showError,
    hideError,
  } = Form({
    defaultName,
    defaultEmail,
    options,
    onSubmit,
    onCancel,
  });

  el = createElement(
    'dialog',
    {
      className: 'dialog',
      open: true,
      onClick: handleDialogClick,
    },
    createElement(
      'div',
      {
        className: 'dialog__content',
        onClick: e => {
          // Stop event propagation so clicks on content modal do not propagate to dialog (which will close dialog)
          e.stopPropagation();
        },
      },
      createElement('h2', { className: 'dialog__header' }, options.formTitle),
      formEl,
    ),
  );

  return {
    el,
    showError,
    hideError,
    setSubmitDisabled,
    setSubmitEnabled,
    open,
    close,
    checkIsOpen,
  };
}
