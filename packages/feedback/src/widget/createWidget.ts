import { getCurrentHub } from '@sentry/core';
import { logger } from '@sentry/utils';

import type { FeedbackFormData, FeedbackInternalOptions, FeedbackWidget } from '../types';
import { handleFeedbackSubmit } from '../util/handleFeedbackSubmit';
import type { ActorComponent } from './Actor';
import { Actor } from './Actor';
import type { DialogComponent } from './Dialog';
import { Dialog } from './Dialog';
import { SuccessMessage } from './SuccessMessage';

interface CreateWidgetParams {
  /**
   * Shadow DOM to append to
   */
  shadow: ShadowRoot;

  /**
   * Feedback integration options
   */
  options: FeedbackInternalOptions & { shouldCreateActor?: boolean };

  /**
   * An element to attach to, that when clicked, will open a dialog
   */
  attachTo?: Element;

  /**
   * If false, will not create an actor
   */
  shouldCreateActor?: boolean;
}

/**
 * Creates a new widget. Returns public methods that control widget behavior.
 */
export function createWidget({
  shadow,
  options: { shouldCreateActor = true, ...options },
  attachTo,
}: CreateWidgetParams): FeedbackWidget {
  let actor: ActorComponent | undefined;
  let dialog: DialogComponent | undefined;
  let isDialogOpen = false;

  /**
   * Show the success message for 5 seconds
   */
  function showSuccessMessage(): void {
    if (!shadow) {
      return;
    }

    try {
      const success = SuccessMessage({
        message: options.successMessageText,
        onRemove: () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          showActor();
        },
      });

      if (!success.el) {
        throw new Error('Unable to show success message');
      }

      shadow.appendChild(success.el);

      const timeoutId = setTimeout(() => {
        if (success) {
          success.remove();
        }
      }, 5000);
    } catch (err) {
      // TODO: error handling
      logger.error(err);
    }
  }

  /**
   * Handler for when the feedback form is completed by the user. This will
   * create and send the feedback message as an event.
   */
  async function _handleFeedbackSubmit(feedback: FeedbackFormData): Promise<void> {
    if (!dialog) {
      return;
    }

    // Simple validation for now, just check for non-empty required fields
    const emptyField = [];
    if (options.isNameRequired && !feedback.name) {
      emptyField.push(options.nameLabel);
    }
    if (options.isEmailRequired && !feedback.email) {
      emptyField.push(options.emailLabel);
    }
    if (!feedback.message) {
      emptyField.push(options.messageLabel);
    }
    if (emptyField.length > 0) {
      dialog.showError(`Please enter in the following required fields: ${emptyField.join(', ')}`);
      return;
    }

    const result = await handleFeedbackSubmit(dialog, feedback);

    // Error submitting feedback
    if (!result) {
      if (options.onSubmitError) {
        options.onSubmitError();
      }

      return;
    }

    // Success
    removeDialog();
    showSuccessMessage();

    if (options.onSubmitSuccess) {
      options.onSubmitSuccess();
    }
  }

  /**
   * Displays the default actor
   */
  function showActor(): void {
    actor && actor.show();
  }

  /**
   * Hides the default actor
   */
  function hideActor(): void {
    actor && actor.hide();
  }

  /**
   * Removes the default actor element
   */
  function removeActor(): void {
    actor && actor.el && actor.el.remove();
  }

  /**
   *
   */
  function openDialog(): void {
    try {
      if (dialog) {
        dialog.open();
        isDialogOpen = true;
        if (options.onFormOpen) {
          options.onFormOpen();
        }
        return;
      }

      const userKey = options.useSentryUser;
      const scope = getCurrentHub().getScope();
      const user = scope && scope.getUser();

      dialog = Dialog({
        colorScheme: options.colorScheme,
        showBranding: options.showBranding,
        showName: options.showName || options.isNameRequired,
        showEmail: options.showEmail || options.isEmailRequired,
        isNameRequired: options.isNameRequired,
        isEmailRequired: options.isEmailRequired,
        formTitle: options.formTitle,
        cancelButtonLabel: options.cancelButtonLabel,
        submitButtonLabel: options.submitButtonLabel,
        emailLabel: options.emailLabel,
        emailPlaceholder: options.emailPlaceholder,
        messageLabel: options.messageLabel,
        messagePlaceholder: options.messagePlaceholder,
        nameLabel: options.nameLabel,
        namePlaceholder: options.namePlaceholder,
        defaultName: (userKey && user && user[userKey.name]) || '',
        defaultEmail: (userKey && user && user[userKey.email]) || '',
        onClosed: () => {
          showActor();
          isDialogOpen = false;

          if (options.onFormClose) {
            options.onFormClose();
          }
        },
        onCancel: () => {
          closeDialog();
          showActor();
        },
        onSubmit: _handleFeedbackSubmit,
      });

      if (!dialog.el) {
        throw new Error('Unable to open Feedback dialog');
      }

      shadow.appendChild(dialog.el);

      // Hides the default actor whenever dialog is opened
      hideActor();

      if (options.onFormOpen) {
        options.onFormOpen();
      }
    } catch (err) {
      // TODO: Error handling?
      logger.error(err);
    }
  }

  /**
   * Closes the dialog
   */
  function closeDialog(): void {
    if (dialog) {
      dialog.close();
      isDialogOpen = false;

      if (options.onFormClose) {
        options.onFormClose();
      }
    }
  }

  /**
   * Removes the dialog element from DOM
   */
  function removeDialog(): void {
    if (dialog) {
      closeDialog();
      const dialogEl = dialog.el;
      dialogEl && dialogEl.remove();
      dialog = undefined;
    }
  }

  /**
   *
   */
  function handleActorClick(): void {
    // Open dialog
    if (!isDialogOpen) {
      openDialog();
    }

    // Hide actor button
    hideActor();
  }

  if (attachTo) {
    attachTo.addEventListener('click', handleActorClick);
  } else if (shouldCreateActor) {
    actor = Actor({ buttonLabel: options.buttonLabel, onClick: handleActorClick });
    actor.el && shadow.appendChild(actor.el);
  }

  return {
    get actor() {
      return actor;
    },
    get dialog() {
      return dialog;
    },

    showActor,
    hideActor,
    removeActor,

    openDialog,
    closeDialog,
    removeDialog,
  };
}
