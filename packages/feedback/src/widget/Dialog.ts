import { getCurrentHub } from '@sentry/core';

import type { FeedbackComponent, FeedbackConfigurationWithDefaults, FeedbackFormData } from '../types';
import { Form } from './Form';
import { createElement as h } from './util/createElement';

interface DialogProps {
  onCancel?: (e: Event) => void;
  onSubmit?: (feedback: FeedbackFormData) => void;
  options: FeedbackConfigurationWithDefaults;
}

interface DialogComponent extends FeedbackComponent<HTMLDialogElement> {
  /**
   * Disable submit button so that it cannot be clicked
   */
  setSubmitDisabled: () => void;
  /**
   * Enable submit buttons so that it can be clicked
   */
  setSubmitEnabled: () => void;
  /**
   * Remove the dialog element from the DOM
   */
  remove: () => void;
  /**
   * Opens and shows the dialog and form
   */
  open: () => void;
  /**
   * Closes the dialog and form
   */
  close: () => void;
}

/**
 * Feedback dialog component that has the form
 */
export function Dialog({ onCancel, onSubmit, options }: DialogProps): DialogComponent {
  let $el: HTMLDialogElement | null = null;

  /**
   *
   */
  function close() {
    if ($el) {
      $el.open = false;
    }
  }

  /**
   *
   */
  function remove() {
    if ($el) {
      $el.remove();
      $el = null;
    }
  }

  /**
   *
   */
  function open() {
    if ($el) {
      $el.open = true;
    }
  }

  const userKey = options.useSentryUser;
  const user = getCurrentHub().getScope()?.getUser();

  const {
    $el: $form,
    setSubmitEnabled,
    setSubmitDisabled,
  } = Form({
    defaultName: (userKey && user && user[userKey.name]) || '',
    defaultEmail: (userKey && user && user[userKey.email]) || '',
    options,
    onSubmit,
    onCancel,
  });

  $el = h(
    'dialog',
    {
      id: 'feedback-dialog',
      className: 'dialog',
      open: true,
      onClick: close,
    },
    h(
      'div',
      {
        className: 'dialog__content',
        onClick: e => {
          // Stop event propagation so clicks on content modal do not propagate to dialog (which will close dialog)
          e.stopPropagation();
        },
      },
      h('h2', { className: 'dialog__header' }, options.formTitle),
      $form,
    ),
  );

  return {
    $el,
    setSubmitDisabled,
    setSubmitEnabled,
    remove,
    open,
    close,
  };
}
