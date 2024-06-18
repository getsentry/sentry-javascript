import { getClient } from '@sentry/core';
import type {
  FeedbackDialog,
  FeedbackInternalOptions,
  FeedbackModalIntegration,
  FeedbackScreenshotIntegration,
  Integration,
  IntegrationFn,
} from '@sentry/types';
import { isBrowser, logger } from '@sentry/utils';
import {
  ADD_SCREENSHOT_LABEL,
  CANCEL_BUTTON_LABEL,
  CONFIRM_BUTTON_LABEL,
  DOCUMENT,
  EMAIL_LABEL,
  EMAIL_PLACEHOLDER,
  FORM_TITLE,
  IS_REQUIRED_LABEL,
  MESSAGE_LABEL,
  MESSAGE_PLACEHOLDER,
  NAME_LABEL,
  NAME_PLACEHOLDER,
  REMOVE_SCREENSHOT_LABEL,
  SUBMIT_BUTTON_LABEL,
  SUCCESS_MESSAGE_TEXT,
  TRIGGER_LABEL,
} from '../constants';
import { DEBUG_BUILD } from '../util/debug-build';
import { isScreenshotSupported } from '../util/isScreenshotSupported';
import { mergeOptions } from '../util/mergeOptions';
import type { ActorComponent } from './components/Actor';
import { Actor } from './components/Actor';
import { createMainStyles } from './createMainStyles';
import { sendFeedback } from './sendFeedback';
import type { OptionalFeedbackConfiguration, OverrideFeedbackConfiguration } from './types';

type Unsubscribe = () => void;

/**
 * Allow users to capture user feedback and send it to Sentry.
 */

interface BuilderOptions {
  // The type here should be `keyof typeof LazyLoadableIntegrations`, but that'll cause a cicrular
  // dependency with @sentry/core
  lazyLoadIntegration: (name: 'feedbackModalIntegration' | 'feedbackScreenshotIntegration') => Promise<IntegrationFn>;
  getModalIntegration?: null | (() => IntegrationFn);
  getScreenshotIntegration?: null | (() => IntegrationFn);
}

export const buildFeedbackIntegration = ({
  lazyLoadIntegration,
  getModalIntegration,
  getScreenshotIntegration,
}: BuilderOptions): IntegrationFn<
  Integration & {
    attachTo(el: Element | string, optionOverrides?: OverrideFeedbackConfiguration): Unsubscribe;
    createForm(optionOverrides?: OverrideFeedbackConfiguration): Promise<FeedbackDialog>;
    createWidget(optionOverrides?: OverrideFeedbackConfiguration): ActorComponent;
    remove(): void;
  }
> => {
  const feedbackIntegration = (({
    // FeedbackGeneralConfiguration
    id = 'sentry-feedback',
    autoInject = true,
    showBranding = true,
    isEmailRequired = false,
    isNameRequired = false,
    showEmail = true,
    showName = true,
    enableScreenshot = true,
    useSentryUser = {
      email: 'email',
      name: 'username',
    },
    tags,

    // FeedbackThemeConfiguration
    colorScheme = 'system',
    themeLight = {},
    themeDark = {},

    // FeedbackTextConfiguration
    addScreenshotButtonLabel = ADD_SCREENSHOT_LABEL,
    cancelButtonLabel = CANCEL_BUTTON_LABEL,
    confirmButtonLabel = CONFIRM_BUTTON_LABEL,
    emailLabel = EMAIL_LABEL,
    emailPlaceholder = EMAIL_PLACEHOLDER,
    formTitle = FORM_TITLE,
    isRequiredLabel = IS_REQUIRED_LABEL,
    messageLabel = MESSAGE_LABEL,
    messagePlaceholder = MESSAGE_PLACEHOLDER,
    nameLabel = NAME_LABEL,
    namePlaceholder = NAME_PLACEHOLDER,
    removeScreenshotButtonLabel = REMOVE_SCREENSHOT_LABEL,
    submitButtonLabel = SUBMIT_BUTTON_LABEL,
    successMessageText = SUCCESS_MESSAGE_TEXT,
    triggerLabel = TRIGGER_LABEL,

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
      enableScreenshot,
      useSentryUser,
      tags,

      colorScheme,
      themeDark,
      themeLight,

      triggerLabel,
      cancelButtonLabel,
      submitButtonLabel,
      confirmButtonLabel,
      formTitle,
      emailLabel,
      emailPlaceholder,
      messageLabel,
      messagePlaceholder,
      nameLabel,
      namePlaceholder,
      successMessageText,
      isRequiredLabel,
      addScreenshotButtonLabel,
      removeScreenshotButtonLabel,

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
        _shadow.appendChild(createMainStyles(options));
      }
      return _shadow as ShadowRoot;
    };

    const _findIntegration = async <I extends Integration>(
      integrationName: string,
      getter: undefined | null | (() => IntegrationFn),
      functionMethodName: 'feedbackModalIntegration' | 'feedbackScreenshotIntegration',
    ): Promise<I> => {
      const client = getClient();
      const existing = client && client.getIntegrationByName(integrationName);
      if (existing) {
        return existing as I;
      }
      const integrationFn = (getter && getter()) || (await lazyLoadIntegration(functionMethodName));
      const integration = integrationFn();
      client && client.addIntegration(integration);
      return integration as I;
    };

    const _loadAndRenderDialog = async (options: FeedbackInternalOptions): Promise<FeedbackDialog> => {
      const screenshotRequired = options.enableScreenshot && isScreenshotSupported();
      const [modalIntegration, screenshotIntegration] = await Promise.all([
        _findIntegration<FeedbackModalIntegration>('FeedbackModal', getModalIntegration, 'feedbackModalIntegration'),
        screenshotRequired
          ? _findIntegration<FeedbackScreenshotIntegration>(
              'FeedbackScreenshot',
              getScreenshotIntegration,
              'feedbackScreenshotIntegration',
            )
          : undefined,
      ]);
      if (!modalIntegration) {
        // TODO: Let the end-user retry async loading
        DEBUG_BUILD &&
          logger.error(
            '[Feedback] Missing feedback modal integration. Try using `feedbackSyncIntegration` in your `Sentry.init`.',
          );
        throw new Error('[Feedback] Missing feedback modal integration!');
      }
      if (screenshotRequired && !screenshotIntegration) {
        DEBUG_BUILD &&
          logger.error('[Feedback] Missing feedback screenshot integration. Proceeding without screenshots.');
      }

      return modalIntegration.createDialog({
        options,
        screenshotIntegration: screenshotRequired ? screenshotIntegration : undefined,
        sendFeedback,
        shadow: _createShadow(options),
      });
    };

    const _attachTo = (el: Element | string, optionOverrides: OverrideFeedbackConfiguration = {}): Unsubscribe => {
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

    const _createActor = (optionOverrides: OverrideFeedbackConfiguration = {}): ActorComponent => {
      const mergedOptions = mergeOptions(_options, optionOverrides);
      const shadow = _createShadow(mergedOptions);
      const actor = Actor({ triggerLabel: mergedOptions.triggerLabel, shadow });
      _attachTo(actor.el, {
        ...mergedOptions,
        onFormOpen() {
          actor.hide();
        },
        onFormClose() {
          actor.show();
        },
        onFormSubmitted() {
          actor.show();
        },
      });
      return actor;
    };

    return {
      name: 'Feedback',
      setupOnce() {
        if (!isBrowser() || !_options.autoInject) {
          return;
        }

        if (DOCUMENT.readyState === 'loading') {
          DOCUMENT.addEventListener('DOMContentLoaded', () => _createActor().appendToDom);
        } else {
          _createActor().appendToDom();
        }
      },

      /**
       * Adds click listener to the element to open a feedback dialog
       *
       * The returned function can be used to remove the click listener
       */
      attachTo: _attachTo,

      /**
       * Creates a new widget which is composed of a Button which triggers a Dialog.
       * Accepts partial options to override any options passed to constructor.
       */
      createWidget(optionOverrides: OverrideFeedbackConfiguration = {}): ActorComponent {
        const actor = _createActor(mergeOptions(_options, optionOverrides));
        actor.appendToDom();
        return actor;
      },

      /**
       * Creates a new Form which you can
       * Accepts partial options to override any options passed to constructor.
       */
      async createForm(optionOverrides: OverrideFeedbackConfiguration = {}): Promise<FeedbackDialog> {
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

  return feedbackIntegration;
};
