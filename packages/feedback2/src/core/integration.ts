import { getClient } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';
import { isBrowser, logger } from '@sentry/utils';
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
} from '../constants';
import type { DialogComponent } from '../modal/components/Dialog';
import type { feedback2ModalIntegration } from '../modal/integration';
import type { feedback2ScreenshotIntegration } from '../screenshot/integration';
import type { FeedbackCallbacks, FeedbackInternalOptions, OptionalFeedbackConfiguration } from '../types';
import { DEBUG_BUILD } from '../util/debug-build';
import { mergeOptions } from '../util/mergeOptions';
import { Actor } from './components/Actor';
import { createMainStyles } from './createMainStyles';
import { sendFeedback } from './sendFeedback';

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

  // /**
  //  * The sentry-provided button to trigger the modal
  //  */
  // private _triggerButton: null | any;

  // /**
  //  * The integration that we will use to render the modal
  //  * This value can be either passed in, or will be async loaded
  //  */
  // private _dialogRenderStrategy: null | any;

  /**
   * The DialogComponent itself, as rendered on the screen
   */
  private _dialog: null | DialogComponent;

  public constructor({
    // FeedbackGeneralConfiguration
    id = 'sentry-feedback',
    showBranding = true,
    autoInject = true,
    showEmail = true,
    showName = true,
    showScreenshot = true,
    useSentryUser = {
      email: 'email',
      name: 'username',
    },
    isNameRequired = false,
    isEmailRequired = false,

    // FeedbackThemeConfiguration
    colorScheme = 'system',
    themeLight,
    themeDark,

    // FeedbackTextConfiguration
    buttonLabel = ACTOR_LABEL,
    cancelButtonLabel = CANCEL_BUTTON_LABEL,
    submitButtonLabel = SUBMIT_BUTTON_LABEL,
    formTitle = FORM_TITLE,
    emailLabel = EMAIL_LABEL,
    emailPlaceholder = EMAIL_PLACEHOLDER,
    messageLabel = MESSAGE_LABEL,
    messagePlaceholder = MESSAGE_PLACEHOLDER,
    nameLabel = NAME_LABEL,
    namePlaceholder = NAME_PLACEHOLDER,
    successMessageText = SUCCESS_MESSAGE_TEXT,

    // FeedbackCallbacks
    onFormOpen,
    onFormClose,
    onSubmitSuccess,
    onSubmitError,
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

    this._host = null;
    this._shadow = null;

    this._dialog = null;
  }

  /**
   * Setup and initialize feedback container
   */
  public setupOnce(): void {
    const options = this.options;
    if (!isBrowser() || !options.autoInject) {
      return;
    }

    const shadow = this._getShadow(options);
    const actor = Actor({ buttonLabel: options.buttonLabel });
    const insertActor = (): void => {
      shadow.appendChild(actor.style);
      shadow.appendChild(actor.el);
    };
    this.attachTo(actor.el, {
      onFormOpen() {
        shadow.removeChild(actor.el);
        shadow.removeChild(actor.style);
        options.onFormOpen && options.onFormOpen();
      },
      onFormClose() {
        insertActor();
        options.onFormClose && options.onFormClose();
      },
      onFormSubmitted() {
        insertActor();
        options.onFormSubmitted && options.onFormSubmitted();
      },
    });

    insertActor();
  }

  /**
   * Removes the Feedback integration (including host, shadow DOM, and all widgets)
   */
  public remove(): void {
    if (this._host) {
      this._host.remove();
    }
    this._host = null;
    this._shadow = null;
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
      const dialog = await this._loadAndRenderDialog(options);
      dialog.open();
    };
    targetEl.addEventListener('click', handleClick);
    return () => {
      targetEl.removeEventListener('click', handleClick);
    };
  }

  /**
   * Creates a new widget. Accepts partial options to override any options passed to constructor.
   */
  public createWidget(
    optionOverrides: OptionalFeedbackConfiguration & { shouldCreateActor?: boolean } = {},
  ): Promise<DialogComponent> {
    const options = mergeOptions(this.options, optionOverrides);

    return this._loadAndRenderDialog(options);
  }

  /**
   * Returns the default widget, if it exists
   */
  public getWidget(): DialogComponent | null {
    return this._dialog;
  }

  /**
   * Allows user to open the dialog box. Creates a new widget if
   * `autoInject` was false, otherwise re-uses the default widget that was
   * created during initialization of the integration.
   */
  public openDialog(): void {
    this._dialog && this._dialog.open();
  }

  /**
   * Closes the dialog for the default widget, if it exists
   */
  public closeDialog(): void {
    this._dialog && this._dialog.close();
  }

  /**
   * Removes the rendered widget, if it exists
   */
  public removeWidget(_widget: null | undefined): void {
    if (this._shadow && this._dialog) {
      this._shadow.removeChild(this._dialog.el);
      this._shadow.removeChild(this._dialog.style);
    }
    this._dialog = null;
  }

  /**
   * Get the dom root, where DOM nodes will be appended into
   */
  protected _getHost(options: FeedbackInternalOptions): HTMLDivElement {
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
  protected _getShadow(options: FeedbackInternalOptions): ShadowRoot {
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
  protected async _loadAndRenderDialog(options: FeedbackInternalOptions): Promise<DialogComponent> {
    if (this._dialog) {
      return this._dialog;
    }

    const client = getClient(); // TODO: getClient<BrowserClient>()
    if (!client) {
      throw new Error('Sentry Client is not initialized correctly');
    }
    const modalIntegration =
      client.getIntegrationByName<ReturnType<typeof feedback2ModalIntegration>>('Feedback2Modal');
    const screenshotIntegration =
      client.getIntegrationByName<ReturnType<typeof feedback2ScreenshotIntegration>>('Feedback2Screenshot');
    const { showScreenshot } = this.options;

    if (showScreenshot === false && screenshotIntegration) {
      // Warn the user that they loaded too much and explicitly asked for screen shots to be off
      console.log('WARNING: youre not rendering screenshots but they are bundled into your application.'); // eslint-disable-line no-console
    }

    // START TEMP: Error messages
    console.log('ensureRenderer:', { modalIntegration, showScreenshot, screenshotIntegration }); // eslint-disable-line no-console
    if (!modalIntegration && showScreenshot && !screenshotIntegration) {
      throw new Error('Async loading of Feedback Modal & Screenshot integrations is not yet implemented');
    } else if (!modalIntegration) {
      throw new Error('Async loading of Feedback Modal is not yet implemented');
    } else if (showScreenshot && !screenshotIntegration) {
      throw new Error('Async loading of Feedback Screenshot integration is not yet implemented');
    }
    // END TEMP

    if (!modalIntegration) {
      // TODO: load modalIntegration
      throw new Error('Not implemented yet');
    }
    if (showScreenshot && !screenshotIntegration) {
      // TODO: load screenshotIntegration
      throw new Error('Not implemented yet');
    }

    const shadow = this._getShadow(options);

    // TODO: some combination stuff when screenshots exists:
    const dialog = modalIntegration.createDialog(
      options,
      {
        onCreate: (dialog: DialogComponent) => {
          shadow.appendChild(dialog.style);
          shadow.appendChild(dialog.el);
        },
        onSubmit: sendFeedback,
        onDone: (dialog: DialogComponent) => {
          shadow.removeChild(dialog.el);
          shadow.removeChild(dialog.style);
          this._dialog = null;
        },
      },
      screenshotIntegration,
    );
    this._dialog = dialog;
    return dialog;
  }
}
