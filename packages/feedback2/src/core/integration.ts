import { convertIntegrationFnToClass, defineIntegration, getClient } from '@sentry/core';
import type { Integration, IntegrationClass, IntegrationFn, IntegrationFnResult } from '@sentry/types';
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
import type { IFeedback2ModalIntegration } from '../modal/integration';
import type { IFeedback2ScreenshotIntegration } from '../screenshot/integration';
import type { FeedbackInternalOptions, OptionalFeedbackConfiguration } from '../types';
import { DEBUG_BUILD } from '../util/debug-build';
import { mergeOptions } from '../util/mergeOptions';
import { Actor } from './components/Actor';
import { createMainStyles } from './createMainStyles';
import { sendFeedback } from './sendFeedback';

interface PublicFeedback2Integration {
  remove: () => void;
  attachTo: (el: Element | string, optionOverrides: OptionalFeedbackConfiguration) => () => void;
  createWidget: (
    optionOverrides: OptionalFeedbackConfiguration & { shouldCreateActor?: boolean },
  ) => Promise<DialogComponent>;
  getWidget: () => DialogComponent | null;
  openDialog: () => void;
  closeDialog: () => void;
  removeWidget: () => void;
}
export type IFeedback2Integration = IntegrationFnResult & PublicFeedback2Integration;

export const _feedback2Integration = (({
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
  onFormSubmitted,
}: OptionalFeedbackConfiguration = {}) => {
  const _options = {
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
    onFormSubmitted,
  };

  let _host: HTMLElement | null = null;
  let _shadow: ShadowRoot | null = null;
  let _dialog: DialogComponent | null = null;

  /**
   * Get the dom root, where DOM nodes will be appended into
   */
  const _getHost = (options: FeedbackInternalOptions): HTMLElement => {
    if (!_host) {
      const { id, colorScheme } = options;

      const host = DOCUMENT.createElement('div');
      _host = host;
      host.id = String(id);
      host.dataset.sentryFeedbackColorscheme = colorScheme;
      DOCUMENT.body.appendChild(_host);
    }
    return _host;
  };

  /**
   * Get the shadow root where we will append css
   */
  const _getShadow = (options: FeedbackInternalOptions): ShadowRoot => {
    if (!_shadow) {
      const host = _getHost(options);

      const { colorScheme, themeDark, themeLight } = options;
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.appendChild(
        // TODO: inject main styles as part of actor and dialog styles
        // therefore each render root can have it's own theme
        // err, everything can just have it's own shadowroot...
        createMainStyles(colorScheme, {
          themeDark,
          themeLight,
        }),
      );
      _shadow = shadow;
    }

    return _shadow;
  };

  const _loadAndRenderDialog = async (options: FeedbackInternalOptions): Promise<DialogComponent> => {
    if (_dialog) {
      return _dialog;
    }

    const client = getClient(); // TODO: getClient<BrowserClient>()
    if (!client) {
      throw new Error('Sentry Client is not initialized correctly');
    }
    const modalIntegration = client.getIntegrationByName<IFeedback2ModalIntegration>('Feedback2Modal');
    const screenshotIntegration = client.getIntegrationByName<IFeedback2ScreenshotIntegration>('Feedback2Screenshot');

    // Disable this because the site could have multiple feedback buttons, not all of them need to have screenshots enabled.
    // Must be a better way...
    //
    // if (showScreenshot === false && screenshotIntegration) {
    //   // Warn the user that they loaded too much and explicitly asked for screen shots to be off
    //   console.log('WARNING: Feedback2Screenshot is bundled but not rendered.'); // eslint-disable-line no-console
    // }

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

    const dialog = modalIntegration.createDialog({
      shadow: _getShadow(options),
      sendFeedback,
      options,
      onDone: () => {
        _dialog = null;
      },
      screenshotIntegration,
    });
    _dialog = dialog;
    return dialog;
  };

  const attachTo = (el: Element | string, optionOverrides: OptionalFeedbackConfiguration = {}): (() => void) => {
    const options = mergeOptions(_options, optionOverrides);

    const targetEl =
      typeof el === 'string' ? DOCUMENT.querySelector(el) : typeof el.addEventListener === 'function' ? el : null;

    if (!targetEl) {
      DEBUG_BUILD && logger.error('[Feedback] Unable to attach to target element');
      throw new Error('Unable to attach to target element');
    }

    const handleClick = async (): Promise<void> => {
      const dialog = await _loadAndRenderDialog(options);
      dialog.open();
    };
    targetEl.addEventListener('click', handleClick);
    return () => {
      targetEl.removeEventListener('click', handleClick);
    };
  };

  return {
    name: 'Feedback2',
    setupOnce() {
      if (!isBrowser() || !_options.autoInject) {
        return;
      }

      const shadow = _getShadow(_options);
      const actor = Actor({ buttonLabel: _options.buttonLabel });
      const insertActor = (): void => {
        shadow.appendChild(actor.style);
        shadow.appendChild(actor.el);
      };
      attachTo(actor.el, {
        onFormOpen() {
          shadow.removeChild(actor.el);
          shadow.removeChild(actor.style);
          _options.onFormOpen && _options.onFormOpen();
        },
        onFormClose() {
          insertActor();
          _options.onFormClose && _options.onFormClose();
        },
        onFormSubmitted() {
          insertActor();
          _options.onFormSubmitted && _options.onFormSubmitted();
        },
      });

      insertActor();
    },

    /**
     * Removes the Feedback integration (including host, shadow DOM, and all widgets)
     */
    remove(): void {
      if (_host) {
        _host.remove();
      }
      _host = null;
      _shadow = null;
    },

    /**
     * Adds click listener to the element to open a feedback dialog
     *
     * The returned function can be used to remove the click listener
     */
    attachTo,

    /**
     * Creates a new widget. Accepts partial options to override any options passed to constructor.
     */
    createWidget(
      optionOverrides: OptionalFeedbackConfiguration & { shouldCreateActor?: boolean } = {},
    ): Promise<DialogComponent> {
      const options = mergeOptions(_options, optionOverrides);

      return _loadAndRenderDialog(options);
    },

    /**
     * Returns the default widget, if it exists
     */
    getWidget(): DialogComponent | null {
      return _dialog;
    },

    /**
     * Allows user to open the dialog box. Creates a new widget if
     * `autoInject` was false, otherwise re-uses the default widget that was
     * created during initialization of the integration.
     */
    openDialog(): void {
      _dialog && _dialog.open();
    },

    /**
     * Closes the dialog for the default widget, if it exists
     */
    closeDialog(): void {
      _dialog && _dialog.close();
    },

    /**
     * Removes the rendered widget, if it exists
     */
    removeWidget(): void {
      if (_shadow && _dialog) {
        _shadow.removeChild(_dialog.el);
        _shadow.removeChild(_dialog.style);
      }
      _dialog = null;
    },
  };
}) satisfies IntegrationFn;

export const feedback2Integration = defineIntegration(_feedback2Integration);

/**
 * @deprecated Use `feedback2ScreenshotIntegration()` instead
 */
// eslint-disable-next-line deprecation/deprecation
export const Feedback2 = convertIntegrationFnToClass('Feedback2', feedback2Integration) as IntegrationClass<
  Integration & PublicFeedback2Integration
>;
