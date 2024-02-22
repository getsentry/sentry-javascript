import { getClient } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';
import { isBrowser, logger } from '@sentry/utils';

import { Actor } from './components/Actor';
import {
  ACTOR_LABEL,
  CANCEL_BUTTON_LABEL,
  DEFAULT_THEME,
  DOCUMENT,
  EMAIL_LABEL,
  EMAIL_PLACEHOLDER,
  FORM_TITLE,
  MESSAGE_LABEL,
  MESSAGE_PLACEHOLDER,
  NAME_LABEL,
  NAME_PLACEHOLDER,
  SUBMIT_BUTTON_LABEL,
  SUCCESS_MESSAGE_TEXT,
} from './constants';

import type { Feedback2Modal } from '../integrations/feedback2-modal';
import type { Feedback2Screenshot } from '../integrations/feedback2-screenshot';

import { createMainStyles } from './createMainStyles';
import { DEBUG_BUILD } from './debug-build';
import type { FeedbackCallbacks, FeedbackInternalOptions, OptionalFeedbackConfiguration } from './types';

import { mergeOptions } from './util/mergeOptions';

export const feedback2Integration = ((options?: OptionalFeedbackConfiguration) => {
  // eslint-disable-next-line deprecation/deprecation
  return new Feedback2(options);
}) satisfies IntegrationFn;

/**
 * Feedback integration. When added as an integration to the SDK, it will
 * inject a button in the bottom-right corner of the window that opens a
 * feedback modal when clicked.
 *
 * @deprecated Use `feedbackIntegration()` instead.
 */
export class Feedback2 implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Feedback2';

  /**
   * @inheritDoc
   */
  public name: string;

  /**
   * Feedback configuration options
   */
  public options: FeedbackInternalOptions;

  /**
   * Reference to the host element where widget is inserted
   */
  private _host: HTMLDivElement | null;

  /**
   * Reference to Shadow DOM root
   */
  private _shadow: ShadowRoot | null;

  /**
   * The sentry-provided button to trigger the modal
   */
  private _triggerButton: null | any;

  /**
   * The integration that we will use to render the modal
   * This value can be either passed in, or will be async loaded
   */
  private _dialogRenderStrategy: null | any;

  /**
   * The ModalComponent itself, as rendered on the screen
   */
  private _modal: null | any;

  public constructor({
    id = 'sentry-feedback',
    showBranding = true,
    autoInject = true,
    showEmail = true,
    showName = true,
    useSentryUser = {
      email: 'email',
      name: 'username',
    },
    isEmailRequired = false,
    isNameRequired = false,

    themeDark,
    themeLight,
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

    onFormClose,
    onFormOpen,
    onSubmitError,
    onSubmitSuccess,
    showScreenshot = true,
  }: OptionalFeedbackConfiguration = {}) {
    // eslint-disable-next-line deprecation/deprecation
    this.name = Feedback2.id;

    this.options = {
      id,
      autoInject,
      showBranding,
      isEmailRequired,
      isNameRequired,
      showEmail,
      showName,
      showScreenshot,
      useSentryUser,

      colorScheme,
      themeDark: {
        ...DEFAULT_THEME.dark,
        ...themeDark,
      },
      themeLight: {
        ...DEFAULT_THEME.light,
        ...themeLight,
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

      onFormClose,
      onFormOpen,
      onSubmitError,
      onSubmitSuccess,
    };

    this._initialize();
  }

  /**
   * Setup and initialize feedback container
   */
  public setupOnce(): void {
    if (!isBrowser() || !this.options.autoInject) {
      return;
    }

    const shadow = this._getShadow(this.options);
    const actor = Actor({ buttonLabel: String(this.options.buttonLabel) });
    shadow.appendChild(actor.style);
    shadow.appendChild(actor.el);
    this.attachTo(actor.el, {});
  }

  /**
   * Removes the Feedback integration (including host, shadow DOM, and all widgets)
   */
  public remove(): void {
    if (this._host) {
      this._host.remove();
    }
    this._initialize();
  }

  /**
   * Adds click listener to attached element to open a feedback dialog
   *
   * The returned function can be used to detact the click listener
   */
  public attachTo(el: Element | string, optionOverrides: Partial<FeedbackCallbacks> = {}): null | (() => void) {
    const options = mergeOptions(this.options, optionOverrides);

    const targetEl =
      typeof el === 'string' ? DOCUMENT.querySelector(el) : typeof el.addEventListener === 'function' ? el : null;

    if (!targetEl) {
      DEBUG_BUILD && logger.error('[Feedback] Unable to attach to target element');
      return null;
    }

    const handleClick = async (): Promise<void> => {
      await this._ensureModalRenderer();
      const shadow = this._getShadow(options); // options have not changed, because optionOverrides is a subset!

      const client = getClient(); // TODO: could be typed as getClient<BrowserClient>(), but that might be a circular import
      if (!client || !client.emit) {
        // After fixing the BrowserClient type above, this might be easier... but if there's no client things are bad.
        throw new Error('Sentry Client is not initialized correctly');
      }
      client.emit('createFeedbackModal', { hello: 'world' }, shadow.appendChild.bind(shadow));
    };
    targetEl.addEventListener('click', handleClick);
    return () => {
      targetEl.removeEventListener('click', handleClick);
    };
  }

  /**
   * Creates a new widget. Accepts partial options to override any options passed to constructor.
   */
  public createWidget(optionOverrides: OptionalFeedbackConfiguration & { shouldCreateActor?: boolean } = {}): null {
    // FeedbackWidget
    const options = mergeOptions(this.options, optionOverrides);

    // the dialog should have some standard callbacks:
    // onFormClose: () => this._triggerButton.show(); this.options.onFormClose()
    // onFormOpen: () => this._triggerButton.hide(); this.options.onFormOpen()
    // onSubmitError: () => this._triggerButton.show(); this.options.onSubmitError();
    // onSubmitSuccess: () => this._triggerButton.show(); this.options.onSubmitSuccss();
    //
    // actually, we might want to rename the callbacks that the form itself takes... or expand the list so that
    // we can allow the form to render the SuccessMessage

    return null;
  }

  /**
   * Returns the default (first-created) widget
   */
  public getWidget(): null {
    // FeedbackWidget (incl dialog!)
    //
    return null;
  }

  /**
   * Allows user to open the dialog box. Creates a new widget if
   * `autoInject` was false, otherwise re-uses the default widget that was
   * created during initialization of the integration.
   */
  public openDialog(): void {
    //
  }

  /**
   * Closes the dialog for the default widget, if it exists
   */
  public closeDialog(): void {
    //
  }

  /**
   * Removes a single widget
   */
  public removeWidget(widget: null | undefined): void {
    //
  }

  /**
   * Initializes values of protected properties
   */
  protected _initialize(): void {
    this._host = null;
    this._shadow = null;
  }

  /**
   * Get the dom root, where DOM nodes will be appended into
   */
  private _getHost(options: FeedbackInternalOptions): HTMLDivElement {
    if (!this._host) {
      const { id, colorScheme } = options;

      const host = DOCUMENT.createElement('div');
      this._host = host;
      host.id = String(id);
      host.dataset.sentryFeedbackColorscheme = colorScheme;
      DOCUMENT.body.appendChild(this._host);
    }
    return this._host;
  }

  /**
   * Get the shadow root where we will append css
   */
  private _getShadow(options: FeedbackInternalOptions): ShadowRoot {
    if (!this._shadow) {
      const host = this._getHost(options);

      const { colorScheme, themeDark, themeLight } = options;
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.appendChild(
        createMainStyles(colorScheme, {
          themeDark,
          themeLight,
        }),
      );
      this._shadow = shadow;
    }

    return this._shadow;
  }

  /**
   *
   */
  private async _ensureModalRenderer(): Promise<void> {
    const client = getClient(); // TODO: could be typed as getClient<BrowserClient>(), but that might be a circular import
    if (!client || !client.getIntegrationByName) {
      // After fixing the BrowserClient type above, this might be easier... but if there's no client things are bad.
      throw new Error('Sentry Client is not initialized correctly');
    }
    const modalIntegration = client.getIntegrationByName<Feedback2Modal>('Feedback2Modal');
    const screenshotIntegration = client.getIntegrationByName<Feedback2Screenshot>('Feedback2Screenshot');
    const { showScreenshot } = this.options;

    // START TEMP: Error messages
    console.log('ensureRenderer:', { modalIntegration, showScreenshot, screenshotIntegration });
    if (!modalIntegration && showScreenshot && !screenshotIntegration) {
      throw new Error('Async loading of Feedback Modal & Screenshot integrations is not yet implemented');
    } else if (!modalIntegration) {
      throw new Error('Async loading of Feedback Modal is not yet implemented');
    } else if (showScreenshot && !screenshotIntegration) {
      throw new Error('Async loading of Feedback Screenshot integration is not yet implemented');
    }
    // END TEMP

    if (showScreenshot === false && screenshotIntegration) {
      // Warn the user that they loaded too much and explicitly asked for screen shots to be off
      console.log('WARNING: youre not rendering screenshots but they are bundled into your application.');
    }

    if (!modalIntegration) {
      // TODO: load modalIntegration
    }
    if (showScreenshot && !screenshotIntegration) {
      // TODO: load screenshotIntegration
    }
  }
}
