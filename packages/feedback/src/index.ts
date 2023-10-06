import type { BrowserClient, Replay } from '@sentry/browser';
import { getCurrentHub } from '@sentry/core';
import type { Integration } from '@sentry/types';
import { isNodeEnv } from '@sentry/utils';

import type {FeedbackConfigurationWithDefaults} from './types';
import { sendFeedbackRequest } from './util/sendFeedbackRequest';
import {Form} from './widget/Form';
import {Icon} from './widget/Icon';

export {sendFeedbackRequest};

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

function retrieveStringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
}

const THEME = {
  light: {
    foreground: '#2B2233',
  },
  dark: {
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
  private dialog: HTMLDialogElement | null = null;
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
    messagePlaceholder = 'What\'s the bug? What did you expect?',
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


    this.injectWidget()
  }

  /**
   *
   */
  protected injectWidget() {
    console.log('injectWidget')

    // TODO: This is only here for hot reloading
    if (this.host) {
      console.log('host already exists');
      this.remove();
    }
    const existingFeedback = document.querySelector('#sentry-feedback');
    if (existingFeedback) {
      console.log('existingFeedback')
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

    const style = document.createElement('style');
    style.textContent = `
  :host {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    --bg-color: #fff;
    --bg-hover-color: #f6f6f7;
    --fg-color: ${THEME.light.foreground};
    --border: 1.5px solid rgba(41, 35, 47, 0.13);
    --box-shadow: 0px 4px 24px 0px rgba(43, 34, 51, 0.12);
  }

  .__sntry_fdbk_dark:host {
    --bg-color: #29232f;
    --bg-hover-color: #352f3b;
    --fg-color: ${THEME.dark.foreground};
    --border: 1.5px solid rgba(235, 230, 239, 0.15);
    --box-shadow: 0px 4px 24px 0px rgba(43, 34, 51, 0.12);
  }

  .widget-actor {
    line-height: 25px;

    display: flex;
    align-items: center;
    gap: 8px;

    border-radius: 12px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    padding: 12px 16px;
    text-decoration: none;
    z-index: 9000;

    color: var(--fg-color);
    background-color: var(--bg-color);
    border: var(--border);
    box-shadow: var(--box-shadow);
    opacity: 1;
    transition: opacity 0.1s ease-in-out;
  }

  .widget-actor:hover {
    background-color: var(--bg-hover-color);
  }

  .widget-actor svg {
    width: 16px;
    height: 16px;
  }

  .widget-actor.hidden {
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
  }

  .widget-actor-text {
  }
`;
    this.shadow.appendChild(style);

    const actorButton = document.createElement('button');
    actorButton.type = 'button';
    actorButton.className = 'widget-actor';
    actorButton.ariaLabel =  this.options.buttonLabel;
    const buttonTextEl = document.createElement('span');
    buttonTextEl.className = 'widget-actor-text';
    buttonTextEl.textContent = this.options.buttonLabel;
    this.shadow.appendChild(actorButton);

    actorButton.appendChild(Icon({color: THEME.light.foreground}));
    actorButton.appendChild(buttonTextEl);



    actorButton.addEventListener('click', this.handleActorClick.bind(this))
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
      this.dialog.open = true;
      return;
    }

    const style = document.createElement('style');
    style.textContent = `
#feedbackDialog {
  --bg-color: #fff;
  --bg-hover-color: #f0f0f0;
  --fg-color: #000;
  --border: 1.5px solid rgba(41, 35, 47, 0.13);
  --box-shadow: 0px 4px 24px 0px rgba(43, 34, 51, 0.12);

  &.__sntry_fdbk_dark {
    --bg-color: #29232f;
    --bg-hover-color: #3a3540;
    --fg-color: #ebe6ef;
    --border: 1.5px solid rgba(235, 230, 239, 0.15);
    --box-shadow: 0px 4px 24px 0px rgba(43, 34, 51, 0.12);
  }

  line-height: 25px;
  background-color: rgba(0, 0, 0, 0.05);
  border: none;
  position: fixed;
  inset: 0;
  z-index: 10000;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 1;
  transition: opacity 0.2s ease-in-out;
}
#feedbackDialog:not([open]) {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}

.feedback-content {
  position: fixed;
  right: 1rem;
  bottom: 1rem;

  border: var(--border);
  padding: 24px;
  border-radius: 20px;
  background-color: var(--bg-color);
  color: var(--fg-color);

  width: 320px;
  max-width: 100%;
  max-height: calc(100% - 2rem);
  display: flex;
  flex-direction: column;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.05),
    0 4px 16px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease-in-out;
  transform: translate(0, 0) scale(1);
  dialog:not([open]) & {
    transform: translate(0, -16px) scale(0.98);
  }
}

.feedback-header {
  font-size: 20px;
  font-weight: 600;
  padding: 0;
  margin: 0;
  margin-bottom: 16px;
}

.error {
  color: red;
  margin-bottom: 16px;
}

.form {
  display: grid;
  overflow: auto;
  flex-direction: column;
  gap: 16px;
  padding: 0;
}

.form__label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0px;
}

.form__input {
  font-family: inherit;
  line-height: inherit;
  box-sizing: border-box;
  border: var(--border);
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  padding: 6px 12px;
  &:focus {
    border-color: rgba(108, 95, 199, 1);
  }
}

.form__input--textarea {
  font-family: inherit;
  resize: vertical;
}

.btn-group {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.btn {
  line-height: inherit;
  border: var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  padding: 6px 16px;

  &[disabled] {
    opacity: 0.6;
    pointer-events: none;
  }
}

.btn--primary {
  background-color: rgba(108, 95, 199, 1);
  border-color: rgba(108, 95, 199, 1);
  color: #fff;
  &:hover {
    background-color: rgba(88, 74, 192, 1);
  }
}

.btn--default {
  background-color: transparent;
  color: var(--fg-color);
  font-weight: 500;
  &:hover {
    background-color: var(--bg-accent-color);
  }
}
`;
    this.shadow?.appendChild(style);

      this.dialog = document.createElement('dialog');
      this.dialog.id = 'feedbackDialog';
      this.dialog.open = true;


      const user = getCurrentHub().getScope()?.getUser();

      const contentDiv = document.createElement('div');
      contentDiv.className = 'feedback-content';
      const header = document.createElement('h2');
      header.className = 'feedback-header';
      header.textContent = this.options.formTitle;

      const formEl = document.createElement('form');
      formEl.className = 'form';
      const nameEl = document.createElement('input');
      nameEl.id = 'name'
      nameEl.type = 'text'; // TODO can be hidden
      nameEl.name = 'name';
      nameEl.className = 'input';
      nameEl.placeholder = this.options.namePlaceholder;
      nameEl.ariaHidden = 'false'; // TODO can be hidden


      const emailEl = document.createElement('input');
      emailEl.type = 'text'; // TODO can be hidden
      emailEl.id = 'email';
      emailEl.name = 'email';
      emailEl.className = 'input';
      emailEl.placeholder = this.options.emailPlaceholder;
      emailEl.ariaHidden = 'false'; // TODO can be hidden

      const nameLabel = document.createElement('label');
      nameLabel.htmlFor = 'name';
      nameLabel.className = 'label';
      nameLabel.append(this.options.nameLabel, nameEl);

      const emailLabel = document.createElement('label');
      emailLabel.htmlFor = 'email';
      emailLabel.className = 'label';
      emailLabel.append(this.options.emailLabel, emailEl);

      const descLabel = document.createElement('label')
      descLabel.htmlFor = 'feedback-message';
      descLabel.className = 'label'
      const descLabelWrapper = document.createElement('span');
      descLabelWrapper.textContent = 'Description'; // TODO should be option

      const messageEl = document.createElement('textarea');
      messageEl.className = 'input';
      messageEl.autofocus = true;
      messageEl.rows = 5;
      messageEl.id = 'feedback-message'
      messageEl.name = 'message';
      messageEl.placeholder = this.options.messagePlaceholder
      const buttonGroup = document.createElement('div');
      buttonGroup.className = 'btn-group';

      const submitEl = document.createElement('button');
      submitEl.className = 'btn btn-primary';
      submitEl.type = 'submit';
      submitEl.textContent = this.options.submitButtonLabel;
      submitEl.disabled = true;
      submitEl.ariaDisabled = 'disabled';

      const cancelEl = document.createElement('button');
      cancelEl.className = 'btn btn-default';
      cancelEl.type = 'button';
      cancelEl.textContent = this.options.cancelButtonLabel;

      this.dialog.addEventListener('click', this.closeDialog);
      contentDiv.addEventListener('click', (e) => {
        // Stop event propagation so clicks on content modal do not propagate to dialog (which will close dialog)
        e.stopPropagation();
      })

      cancelEl.addEventListener('click', this.closeDialog);
      messageEl.addEventListener('keyup', (e) => {
        if (!(e.currentTarget instanceof HTMLTextAreaElement)) {
          return;
        }

        if (e.currentTarget.value) {
          submitEl.ariaDisabled = 'false';
          submitEl.disabled = false;
        } else {
          submitEl.ariaDisabled = 'true';
          submitEl.disabled = true;
        }
      })

      buttonGroup.append(submitEl, cancelEl);
      descLabel.append(descLabelWrapper, messageEl);
      formEl.append(nameLabel, emailLabel, descLabel, buttonGroup);

      const userKey = this.options.useSentryUser;

      const {$form} = Form({
        defaultName: userKey && user?.[userKey.name] || '',
        defaultEmail: userKey && user?.[userKey.email] || '',
        options: this.options})
      contentDiv.append(header, $form)

      this.dialog.appendChild(contentDiv)
      this.shadow?.appendChild(this.dialog)
  }

  /**
   * Closes the dialog
   */
  public closeDialog = () => {
    if (this.dialog) {
      this.dialog.open = false;
    }

    // TODO: if has default actor, show the button

    if (this.actor) {
      this.actor.classList.remove('hidden');
    }
  }
}
