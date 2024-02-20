import { getCurrentScope } from '@sentry/core';
import { logger } from '@sentry/utils';
import { WINDOW } from '../constants';
import { FEEDBACK_WIDGET_SOURCE } from '../constants';
import { DEBUG_BUILD } from '../debug-build';
import { sendFeedback } from '../sendFeedback';
import type { DialogComponent, FeedbackFormData, FeedbackInternalOptions, FeedbackWidget } from '../types';
import { getMissingFields } from '../util/validate';
import type { ActorComponent } from './Actor';
import { Actor } from './Actor';
import { loadDialog } from './loadDialog';

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
  const doc = WINDOW.document;

  let actor: ActorComponent | undefined;
  let dialog: DialogComponent | undefined;

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

        if (options.onFormOpen) {
          options.onFormOpen();
        }
        return;
      }

      const userKey = options.useSentryUser;
      const scope = getCurrentScope();
      const user = scope && scope.getUser();

      loadDialog({ screenshots: false })
        .then(({ Dialog, showSuccessMessage, createDialogStyles }) => {
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
            onCancel: () => {
              closeDialog();
              showActor();
            },
            onSubmit: async function _handleFeedbackSubmit(feedback: FeedbackFormData): Promise<void> {
              if (!dialog) {
                return;
              }

              const missingFields = getMissingFields(feedback, options);
              if (missingFields.length > 0) {
                dialog.showError(`Please enter in the following required fields: ${missingFields.join(', ')}`);
                return;
              }

              dialog.hideError();
              try {
                await sendFeedback({ ...feedback, source: FEEDBACK_WIDGET_SOURCE });
              } catch (err) {
                DEBUG_BUILD && logger.error(err);
                dialog.showError('There was a problem submitting feedback, please wait and try again.');
                if (options.onSubmitError) {
                  options.onSubmitError();
                }
                return;
              }

              removeDialog();
              showSuccessMessage(shadow, options, showActor);
              if (options.onSubmitSuccess) {
                options.onSubmitSuccess();
              }
            },
          });

          if (!dialog.el) {
            throw new Error('Unable to open Feedback dialog');
          }

          shadow.appendChild(dialog.el);
          shadow.appendChild(createDialogStyles(doc));

          // Hides the default actor whenever dialog is opened
          hideActor();

          if (options.onFormOpen) {
            options.onFormOpen();
          }
        })
        .catch(err => {
          // TODO: Error handling?
          logger.error(err);
          console.log(err); // eslint-disable-line no-console
        });
    } catch (err) {
      // TODO: Error handling?
      logger.error(err);
      console.log(err); // eslint-disable-line no-console
    }
  }

  /**
   * Closes the dialog
   */
  function closeDialog(): void {
    if (dialog) {
      dialog.close();

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
    if (!dialog || !dialog.checkIsOpen()) {
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
