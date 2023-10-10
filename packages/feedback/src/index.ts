import { getCurrentHub } from '@sentry/core';
import type { Integration } from '@sentry/types';
import { isNodeEnv } from '@sentry/utils';

import type { FeedbackConfigurationWithDefaults } from './types';
import { sendFeedbackRequest } from './util/sendFeedbackRequest';
import { createActorStyles } from './widget/Actor.css';
import { Dialog } from './widget/Dialog';
import { createDialogStyles } from './widget/Dialog.css';
import { Icon } from './widget/Icon';

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
  },
  dark: {
    background: '#29232f',
    foreground: '#EBE6EF',
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

  public options: FeedbackConfigurationWithDefaults;

  private actor: HTMLButtonElement | null = null;
  private dialog: ReturnType<typeof Dialog> | null = null;
  private host: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private isDialogOpen: boolean = false;

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
  }: Partial<FeedbackConfigurationWithDefaults> = {}) {
    this.name = Feedback.id;
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
   *
   */
  protected _injectWidget() {
    // TODO: This is only here for hot reloading
    if (this.host) {
      this.remove();
    }
    const existingFeedback = document.querySelector('#sentry-feedback');
    if (existingFeedback) {
      existingFeedback.remove();
    }

    // TODO: End hotloading

    this.createWidgetButton();

    if (!this.host) {
      return;
    }

    document.body.appendChild(this.host);
  }

  /**
   * Removes the Feedback widget
   */
  public remove() {
    if (this.host) {
      this.host.remove();
    }
  }

  /**
   *
   */
  protected createWidgetButton() {
    // Create the host
    this.host = document.createElement('div');
    this.host.id = 'sentry-feedback';
    this.shadow = this.host.attachShadow({ mode: 'open' });

    this.shadow.appendChild(createActorStyles(document, THEME));

    const actorButton = document.createElement('button');
    actorButton.type = 'button';
    actorButton.className = 'widget-actor';
    actorButton.ariaLabel = this.options.buttonLabel;
    const buttonTextEl = document.createElement('span');
    buttonTextEl.className = 'widget-actor-text';
    buttonTextEl.textContent = this.options.buttonLabel;
    this.shadow.appendChild(actorButton);

    actorButton.appendChild(Icon({ color: THEME.light.foreground }));
    actorButton.appendChild(buttonTextEl);

    actorButton.addEventListener('click', this.handleActorClick.bind(this));
    this.actor = actorButton;
  }

  /**
   *
   */
  protected handleActorClick() {
    console.log('button clicked');

    // Open dialog
    if (!this.isDialogOpen) {
      this.openDialog();
    }

    // Hide actor button
    if (this.actor) {
      this.actor.classList.add('hidden');
    }
  }

  /**
   * Opens the Feedback dialog form
   */
  public openDialog() {
    if (this.dialog) {
      this.dialog.openDialog();
      return;
    }

    this.shadow?.appendChild(createDialogStyles(document, THEME));
    this.dialog = Dialog({ onCancel: this.closeDialog, options: this.options });
    this.shadow?.appendChild(this.dialog.$el);
  }

  /**
   * Closes the dialog
   */
  public closeDialog = () => {
    if (this.dialog) {
      this.dialog.closeDialog();
    }

    // TODO: if has default actor, show the button

    if (this.actor) {
      this.actor.classList.remove('hidden');
    }
  };
}
