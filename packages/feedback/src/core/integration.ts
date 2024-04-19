import { getClient } from '@sentry/core';
import type {
  FeedbackDialog,
  FeedbackInternalOptions,
  FeedbackModalIntegration,
  FeedbackScreenshotIntegration,
  IntegrationFn,
} from '@sentry/types';
import { isBrowser, logger } from '@sentry/utils';
import {
  ACTOR_LABEL,
  CANCEL_BUTTON_LABEL,
  DEFAULT_THEME,
  DOCUMENT,
  EMAIL_LABEL,
  EMAIL_PLACEHOLDER,
  FORM_TITLE,
  IS_REQUIRED_TEXT,
  MESSAGE_LABEL,
  MESSAGE_PLACEHOLDER,
  NAME_LABEL,
  NAME_PLACEHOLDER,
  SUBMIT_BUTTON_LABEL,
  SUCCESS_MESSAGE_TEXT,
} from '../constants';
import { feedbackModalIntegration } from '../modal/integration';
import { DEBUG_BUILD } from '../util/debug-build';
import { isScreenshotSupported } from '../util/isScreenshotSupported';
import { mergeOptions } from '../util/mergeOptions';
import { Actor } from './components/Actor';
import { createMainStyles } from './createMainStyles';
import { sendFeedback } from './sendFeedback';
import type { OptionalFeedbackConfiguration, OverrideFeedbackConfiguration } from './types';

type Unsubscribe = () => void;

/**
 * Allow users to capture user feedback and send it to Sentry.
 */
export const feedbackIntegration = (({
  // FeedbackGeneralConfiguration
  id = 'sentry-feedback',
  showBranding = true,
  autoInject = true,
  showEmail = true,
  showName = true,
  showScreenshot = false,
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
  isRequiredText = IS_REQUIRED_TEXT,

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
    isRequiredText,

    onFormClose,
    onFormOpen,
    onSubmitError,
    onSubmitSuccess,
    onFormSubmitted,
  };

  let _shadow: ShadowRoot | null = null;
  let _subscriptions: Unsubscribe[] = [];

  /**
   * Get the shadow root where we will append css
   */
  const _createShadow = (options: FeedbackInternalOptions): ShadowRoot => {
    if (!_shadow) {
      const host = DOCUMENT.createElement('div');
      host.id = String(options.id);
      DOCUMENT.body.appendChild(host);

      _shadow = host.attachShadow({ mode: 'open' });
      _shadow.appendChild(createMainStyles(options.colorScheme, options));
    }
    return _shadow as ShadowRoot;
  };

  const _loadAndRenderDialog = async (options: FeedbackInternalOptions): Promise<FeedbackDialog> => {
    const client = getClient(); // TODO: getClient<BrowserClient>()
    if (!client) {
      throw new Error('Sentry Client is not initialized correctly');
    }
    const modalIntegration: FeedbackModalIntegration = feedbackModalIntegration();
    client.addIntegration(modalIntegration);
    const screenshotIntegration = client.getIntegrationByName<FeedbackScreenshotIntegration>('FeedbackScreenshot');
    const screenshotIsSupported = isScreenshotSupported();

    // START TEMP: Error messages
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

    if (showScreenshot && !screenshotIntegration && screenshotIsSupported) {
      // TODO: load screenshotIntegration
      throw new Error('Not implemented yet');
    }

    return modalIntegration.createDialog({
      options,
      screenshotIntegration: screenshotIsSupported ? screenshotIntegration : undefined,
      sendFeedback,
      shadow: _createShadow(options),
    });
  };

  const attachTo = (el: Element | string, optionOverrides: OverrideFeedbackConfiguration = {}): Unsubscribe => {
    const mergedOptions = mergeOptions(_options, optionOverrides);

    const targetEl =
      typeof el === 'string' ? DOCUMENT.querySelector(el) : typeof el.addEventListener === 'function' ? el : null;

    if (!targetEl) {
      DEBUG_BUILD && logger.error('[Feedback] Unable to attach to target element');
      throw new Error('Unable to attach to target element');
    }

    let dialog: FeedbackDialog | null = null;
    const handleClick = async (): Promise<void> => {
      if (!dialog) {
        dialog = await _loadAndRenderDialog({
          ...mergedOptions,
          onFormClose: () => {
            dialog && dialog.close();
            mergedOptions.onFormClose && mergedOptions.onFormClose();
          },
          onFormSubmitted: () => {
            dialog && dialog.removeFromDom();
            mergedOptions.onFormSubmitted && mergedOptions.onFormSubmitted();
          },
        });
      }
      dialog.appendToDom();
      dialog.open();
    };
    targetEl.addEventListener('click', handleClick);
    const unsubscribe = (): void => {
      _subscriptions = _subscriptions.filter(sub => sub !== unsubscribe);
      dialog && dialog.removeFromDom();
      dialog = null;
      targetEl.removeEventListener('click', handleClick);
    };
    _subscriptions.push(unsubscribe);
    return unsubscribe;
  };

  const autoInjectActor = (): void => {
    const shadow = _createShadow(_options);
    const actor = Actor({ buttonLabel: _options.buttonLabel, shadow });
    const mergedOptions = mergeOptions(_options, {
      onFormOpen() {
        actor.removeFromDom();
      },
      onFormClose() {
        actor.appendToDom();
      },
      onFormSubmitted() {
        actor.appendToDom();
      },
    });
    attachTo(actor.el, mergedOptions);

    actor.appendToDom();
  };

  return {
    name: 'Feedback',
    setupOnce() {
      if (!isBrowser() || !_options.autoInject) {
        return;
      }

      autoInjectActor();
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
    async createWidget(optionOverrides: OverrideFeedbackConfiguration = {}): Promise<FeedbackDialog> {
      return _loadAndRenderDialog(mergeOptions(_options, optionOverrides));
    },

    /**
     * Removes the Feedback integration (including host, shadow DOM, and all widgets)
     */
    remove(): void {
      if (_shadow) {
        _shadow.parentElement && _shadow.parentElement.remove();
        _shadow = null;
      }
      // Remove any lingering subscriptions
      _subscriptions.forEach(sub => sub());
      _subscriptions = [];
    },
  };
}) satisfies IntegrationFn;
