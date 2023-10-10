import { getCurrentHub } from '@sentry/core';

import type { FeedbackConfigurationWithDefaults, FeedbackFormData } from '../types';
import { Form } from './Form';
import { createElement as h } from './util/createElement';

interface DialogProps {
  onCancel?: (e: Event) => void;
  onSubmit?: (feedback: FeedbackFormData) => void;
  options: FeedbackConfigurationWithDefaults;
}

interface DialogReturn {
  $el: HTMLDialogElement;
  setSubmitDisabled: () => void;
  setSubmitEnabled: () => void;
  removeDialog: () => void;
  openDialog: () => void;
  closeDialog: () => void;
}

/**
 * Feedback dialog component that has the form
 */
export function Dialog({ onCancel, onSubmit, options }: DialogProps): DialogReturn {
  let $el: HTMLDialogElement | null = null;

  /**
   *
   */
  function closeDialog() {
    if ($el) {
      $el.open = false;
    }
  }

  /**
   *
   */
  function removeDialog() {
    if ($el) {
      $el.remove();
      $el = null;
    }
  }

  /**
   *
   */
  function openDialog() {
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
      onClick: closeDialog,
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
    removeDialog,
    openDialog,
    closeDialog,
  };
}
