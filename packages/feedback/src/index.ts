import { getCurrentHub } from '@sentry/core';
import type { Integration } from '@sentry/types';
import { isNodeEnv } from '@sentry/utils';

import { sendFeedback } from './sendFeedback';
import type { FeedbackConfigurationWithDefaults, FeedbackFormData } from './types';
import { sendFeedbackRequest } from './util/sendFeedbackRequest';
import { Actor } from './widget/Actor';
import { createActorStyles } from './widget/Actor.css';
import { Dialog } from './widget/Dialog';
import { createDialogStyles } from './widget/Dialog.css';
import { SuccessMessage } from './widget/SuccessMessage';

export { sendFeedbackRequest };

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

const THEME = {
  light: {
    background: '#ffffff',
    foreground: '#2B2233',
    success: '#268d75',
    error: '#df3338',
  },
  dark: {
    background: '#29232f',
    foreground: '#EBE6EF',
    success: '#2da98c',
    error: '#f55459',
  },
};

/**
 *
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
    showEmail = true,
    showName = true,
    useSentryUser = {
      email: 'email',
      name: 'username',
    },
    isAnonymous = true,
    isEmailRequired = false,
    isNameRequired = false,

    buttonLabel = 'Report a Bug',
    cancelButtonLabel = 'Cancel',
    submitButtonLabel = 'Send Bug Report',
    formTitle = 'Report a Bug',
    emailPlaceholder = 'your.email@example.org',
    emailLabel = 'Email',
    messagePlaceholder = "What's the bug? What did you expect?",
    messageLabel = 'Description',
    namePlaceholder = 'Your Name',
    nameLabel = 'Name',
    successMessageText = 'Thank you for your report!',
  }: Partial<FeedbackConfigurationWithDefaults> = {}) {
    // Initializations
    this.name = Feedback.id;
    this._actor = null;
    this._dialog = null;
    this._host = null;
    this._shadow = null;
    this._isDialogOpen = false;
    this._hasDialogOpened = false;

    this.options = {
      isAnonymous,
      isEmailRequired,
      isNameRequired,
      showEmail,
      showName,
      useSentryUser,

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

    this._injectWidget();
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
    if (this._dialog) {
      this._dialog.open();
      return;
    }

    if (!this._shadow) {
      this._shadow = this._createShadowHost();
    }

    // Lazy-load until dialog is opened and only inject styles once
    if (!this._hasDialogOpened) {
      this._shadow.appendChild(createDialogStyles(document, THEME));
    }

    const userKey = this.options.useSentryUser;
    const scope = getCurrentHub().getScope();
    const user = scope && scope.getUser();

    this._dialog = Dialog({
      defaultName: (userKey && user && user[userKey.name]) || '',
      defaultEmail: (userKey && user && user[userKey.email]) || '',
      onClose: () => {
        this.showActor();
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
  }

  /**
   * Hides the dialog
   */
  public hideDialog = (): void => {
    if (this._dialog) {
      this._dialog.close();
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
   *
   */
  protected _injectWidget(): void {
    // TODO: This is only here for hot reloading
    if (this._host) {
      this.remove();
    }
    const existingFeedback = document.querySelector('#sentry-feedback');
    if (existingFeedback) {
      existingFeedback.remove();
    }

    // TODO: End hotloading

    this._shadow = this._createShadowHost();
    this._createWidgetActor();

    if (!this._host) {
      return;
    }

    document.body.appendChild(this._host);
  }

  /**
   * Creates the host element of widget's shadow DOM
   */
  protected _createShadowHost(): ShadowRoot {
    // Create the host
    this._host = document.createElement('div');
    this._host.id = 'sentry-feedback';

    // Create the shadow root
    const shadow = this._host.attachShadow({ mode: 'open' });

    // Insert styles for actor
    shadow.appendChild(createActorStyles(document, THEME));

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

    this._shadow.appendChild(createActorStyles(document, THEME));

    // Create Actor component
    this._actor = Actor({ options: this.options, theme: THEME, onClick: this._handleActorClick });

    this._shadow.appendChild(this._actor.$el);
  }

  /**
   * Show the success message for 5 seconds
   */
  protected _showSuccessMessage(): void {
    if (!this._shadow) {
      return;
    }

    const success = SuccessMessage({
      message: this.options.successMessageText,
      onRemove: () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        this.showActor();
      },
      theme: THEME,
    });

    this._shadow.appendChild(success.$el);

    const timeoutId = setTimeout(() => {
      if (success) {
        success.remove();
      }
    }, 5000);
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
  };

  /**
   * Handler for when the feedback form is completed by the user. This will
   * create and send the feedback message as an event.
   */
  protected _handleFeedbackSubmit = async (feedback: FeedbackFormData): Promise<void> => {
    console.log('ahndle feedback submit');
    if (!this._dialog) {
      // Not sure when this would happen
      return;
    }

    try {
      this._dialog.hideError();
      this._dialog.setSubmitDisabled();
      const resp = await sendFeedback(feedback);
      console.log({ resp });
      if (resp) {
        // Success!
        this.removeDialog();
        this._showSuccessMessage();
        return;
      }

      // Errored... re-enable submit button
      this._dialog.setSubmitEnabled();
      this._dialog.showError('There was a problem submitting feedback, please wait and try again.');
    } catch {
      // Errored... re-enable submit button
      this._dialog.setSubmitEnabled();
      this._dialog.showError('There was a problem submitting feedback, please wait and try again.');
    }
  };
}
