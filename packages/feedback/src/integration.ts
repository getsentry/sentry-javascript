import { getCurrentHub } from '@sentry/core';
import type { Integration } from '@sentry/types';
import { isNodeEnv, logger } from '@sentry/utils';
import { ACTOR_LABEL, CANCEL_BUTTON_LABEL, DEFAULT_THEME, EMAIL_LABEL, EMAIL_PLACEHOLDER, FORM_TITLE, MESSAGE_LABEL, MESSAGE_PLACEHOLDER, NAME_LABEL, NAME_PLACEHOLDER, SUBMIT_BUTTON_LABEL, SUCCESS_MESSAGE_TEXT } from './constants';

import type { FeedbackConfigurationWithDefaults, FeedbackFormData, FeedbackTheme } from './types';
import { handleFeedbackSubmit } from './util/handleFeedbackSubmit';
import { Actor } from './widget/Actor';
import { createActorStyles } from './widget/Actor.css';
import { Dialog } from './widget/Dialog';
import { createDialogStyles } from './widget/Dialog.css';
import { createMainStyles } from './widget/Main.css';
import { SuccessMessage } from './widget/SuccessMessage';

type ElectronProcess = { type?: string };

// Electron renderers with nodeIntegration enabled are detected as Node.js so we specifically test for them
function isElectronNodeRenderer(): boolean {
  return typeof process !== 'undefined' && (process as ElectronProcess).type === 'renderer';
}
/**
 * Returns true if we are in the browser.
 */
function isBrowser(): boolean {
  // eslint-disable-next-line no-restricted-globals
  return typeof window !== 'undefined' && (!isNodeEnv() || isElectronNodeRenderer());
}

interface FeedbackConfiguration extends Partial<Omit<FeedbackConfigurationWithDefaults, 'theme'>> {
  theme?: {
    dark?: Partial<FeedbackTheme>;
    light?: Partial<FeedbackTheme>;
  }
}

/**
 * Feedback integration. When added as an integration to the SDK, it will
 * inject a button in the bottom-right corner of the window that opens a
 * feedback modal when clicked.
 */
export class Feedback implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Feedback';

  /**
   * @inheritDoc
   */
  public name: string;

  /**
   * Feedback configuration options
   */
  public options: FeedbackConfigurationWithDefaults;

  /**
   * Reference to widget actor element (button that opens dialog).
   */
  private _actor: ReturnType<typeof Actor> | null;
  /**
   * Reference to dialog element
   */
  private _dialog: ReturnType<typeof Dialog> | null;
  /**
   * Reference to the host element where widget is inserted
   */
  private _host: HTMLDivElement | null;
  /**
   * Refernce to Shadow DOM root
   */
  private _shadow: ShadowRoot | null;
  /**
   * State property to track if dialog is currently open
   */
  private _isDialogOpen: boolean;

  /**
   * Tracks if dialog has ever been opened at least one time
   */
  private _hasDialogOpened: boolean;

  public constructor({
    attachTo = null,
    autoInject = true,
    showEmail = true,
    showName = true,
    useSentryUser = {
      email: 'email',
      name: 'username',
    },
    isAnonymous = false,
    isEmailRequired = false,
    isNameRequired = false,

    theme,
    colorScheme = 'system',

    buttonLabel = ACTOR_LABEL,
    cancelButtonLabel = CANCEL_BUTTON_LABEL,
    submitButtonLabel = SUBMIT_BUTTON_LABEL,
    formTitle = FORM_TITLE,
    emailPlaceholder = EMAIL_PLACEHOLDER,
    emailLabel = EMAIL_LABEL,
    messagePlaceholder = MESSAGE_PLACEHOLDER,
    messageLabel = MESSAGE_LABEL,
    namePlaceholder = NAME_PLACEHOLDER,
    nameLabel = NAME_LABEL,
    successMessageText = SUCCESS_MESSAGE_TEXT,

    onOpenDialog,
  }: FeedbackConfiguration  = {}) {
    // Initializations
    this.name = Feedback.id;
    this._actor = null;
    this._dialog = null;
    this._host = null;
    this._shadow = null;
    this._isDialogOpen = false;
    this._hasDialogOpened = false;

    this.options = {
      attachTo,
      autoInject,
      isAnonymous,
      isEmailRequired,
      isNameRequired,
      showEmail,
      showName,
      useSentryUser,

      colorScheme,
      theme: {
        dark: Object.assign({}, DEFAULT_THEME.dark, theme && theme.dark),
        light: Object.assign({}, DEFAULT_THEME.light, theme && theme.light),
      },

      buttonLabel,
      cancelButtonLabel,
      submitButtonLabel,
      formTitle,
      emailLabel,
      emailPlaceholder,
      messageLabel,
      messagePlaceholder,
      nameLabel,
      namePlaceholder,
      successMessageText,

      onOpenDialog,
    };

    // TOOD: temp for testing;
    this.setupOnce();
  }

  /** If replay has already been initialized */
  /**
   * Setup and initialize replay container
   */
  public setupOnce(): void {
    if (!isBrowser()) {
      return;
    }

    try {
      // TODO: This is only here for hot reloading
      if (this._host) {
        this.remove();
      }
      const existingFeedback = document.querySelector('#sentry-feedback');
      if (existingFeedback) {
        existingFeedback.remove();
      }
      // TODO: End hotloading

      const { attachTo, autoInject } = this.options;
      if (!attachTo && !autoInject) {
        // Nothing to do here
        return;
      }

      // Setup host element + shadow DOM, if necessary
      this._shadow = this._createShadowHost();

      // If `attachTo` is defined, then attach click handler to it
      if (attachTo) {
        const actorTarget =
          typeof attachTo === 'string'
            ? document.querySelector(attachTo)
            : typeof attachTo === 'function'
            ? attachTo
            : null;

        if (!actorTarget) {
          logger.warn(`[Feedback] Unable to find element with selector ${actorTarget}`);
          return;
        }

        actorTarget.addEventListener('click', this._handleActorClick);
      } else {
        this._createWidgetActor();
      }

      if (!this._host) {
        logger.warn('[Feedback] Unable to create host element');
        return;
      }

      document.body.appendChild(this._host);
    } catch (err) {
      // TODO: error handling
      console.error(err);
    }
  }

  /**
   * Removes the Feedback widget
   */
  public remove(): void {
    if (this._host) {
      this._host.remove();
    }
  }

  /**
   * Opens the Feedback dialog form
   */
  public openDialog(): void {
    try {
      if (this._dialog) {
        this._dialog.open();
        this._isDialogOpen = true;
        return;
      }

      try {
        this._shadow = this._createShadowHost();
      } catch {
        return;
      }

      // Lazy-load until dialog is opened and only inject styles once
      if (!this._hasDialogOpened) {
        this._shadow.appendChild(createDialogStyles(document));
      }

      const userKey = this.options.useSentryUser;
      const scope = getCurrentHub().getScope();
      const user = scope && scope.getUser();

      this._dialog = Dialog({
        defaultName: (userKey && user && user[userKey.name]) || '',
        defaultEmail: (userKey && user && user[userKey.email]) || '',
        onClose: () => {
          this.showActor();
          this._isDialogOpen = false;
        },
        onCancel: () => {
          this.hideDialog();
          this.showActor();
        },
        onSubmit: this._handleFeedbackSubmit,
        options: this.options,
      });
      this._shadow.appendChild(this._dialog.$el);

      // Hides the default actor whenever dialog is opened
      this._actor && this._actor.hide();

      this._hasDialogOpened = true;
    } catch (err) {
      // TODO: Error handling?
      console.error(err);
    }
  }

  /**
   * Hides the dialog
   */
  public hideDialog = (): void => {
    if (this._dialog) {
      this._dialog.close();
      this._isDialogOpen = false;
    }
  };

  /**
   * Removes the dialog element from DOM
   */
  public removeDialog = (): void => {
    if (this._dialog) {
      this._dialog.$el.remove();
      this._dialog = null;
    }
  };

  /**
   * Displays the default actor
   */
  public showActor = (): void => {
    // TODO: Only show default actor
    if (this._actor) {
      this._actor.show();
    }
  };

  /**
   * Creates the host element of widget's shadow DOM. Returns null if not supported.
   */
  protected _createShadowHost(): ShadowRoot {
    if (!document.head.attachShadow) {
      // Shadow DOM not supported
      logger.warn('[Feedback] Browser does not support shadow DOM API');
      throw new Error('Browser does not support shadow DOM API.');
    }

    // Don't create if it already exists
    if (this._shadow) {
      return this._shadow;
    }

    // Create the host
    this._host = document.createElement('div');
    this._host.id = 'sentry-feedback';

    // Create the shadow root
    const shadow = this._host.attachShadow({ mode: 'open' });

    shadow.appendChild(createMainStyles(document, this.options.colorScheme, this.options.theme));

    return shadow;
  }

  /**
   * Creates the host element of our shadow DOM as well as the actor
   */
  protected _createWidgetActor(): void {
    if (!this._shadow) {
      // This shouldn't happen... we could call `_createShadowHost` if this is the case?
      return;
    }

    try {
      this._shadow.appendChild(createActorStyles(document));

      // Create Actor component
      this._actor = Actor({ options: this.options, onClick: this._handleActorClick });

      this._shadow.appendChild(this._actor.$el);
    } catch (err) {
      // TODO: error handling
      console.error(err);
    }
  }

  /**
   * Show the success message for 5 seconds
   */
  protected _showSuccessMessage(): void {
    if (!this._shadow) {
      return;
    }

    try {
      const success = SuccessMessage({
        message: this.options.successMessageText,
        onRemove: () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          this.showActor();
        },
      });

      this._shadow.appendChild(success.$el);

      const timeoutId = setTimeout(() => {
        if (success) {
          success.remove();
        }
      }, 5000);
    } catch (err) {
      // TODO: error handling
      console.error(err);
    }
  }

  /**
   * Handles when the actor is clicked, opens the dialog modal and calls any
   * callbacks.
   */
  protected _handleActorClick = (): void => {
    // Open dialog
    if (!this._isDialogOpen) {
      this.openDialog();
    }

    // Hide actor button
    if (this._actor) {
      this._actor.hide();
    }

    if (this.options.onOpenDialog) {
      this.options.onOpenDialog();
    }
  };

  /**
   * Handler for when the feedback form is completed by the user. This will
   * create and send the feedback message as an event.
   */
  protected _handleFeedbackSubmit = async (feedback: FeedbackFormData): Promise<void> => {
    const result = await handleFeedbackSubmit(this._dialog, feedback);

    // Success
    if (result) {
      this.removeDialog();
      this._showSuccessMessage();
    }
  };
}
