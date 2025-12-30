/* eslint-disable max-lines */

import type {
  FeedbackInternalOptions,
  FeedbackModalIntegration,
  FeedbackScreenshotIntegration,
  Integration,
  IntegrationFn,
} from '@sentry/core';
import { addIntegration, debug, isBrowser } from '@sentry/core';
import {
  ADD_SCREENSHOT_LABEL,
  CANCEL_BUTTON_LABEL,
  CONFIRM_BUTTON_LABEL,
  DOCUMENT,
  EMAIL_LABEL,
  EMAIL_PLACEHOLDER,
  FORM_TITLE,
  HIDE_TOOL_TEXT,
  HIGHLIGHT_TOOL_TEXT,
  IS_REQUIRED_LABEL,
  MESSAGE_LABEL,
  MESSAGE_PLACEHOLDER,
  NAME_LABEL,
  NAME_PLACEHOLDER,
  REMOVE_HIGHLIGHT_TEXT,
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

type BuilderOptions =
  | {
      lazyLoadIntegration?: never;
      getModalIntegration: () => IntegrationFn;
      getScreenshotIntegration: () => IntegrationFn;
    }
  | {
      // The type here should be `keyof typeof LazyLoadableIntegrations`, but that'll cause a cicrular
      // dependency with @sentry/core
      lazyLoadIntegration: (
        name: 'feedbackModalIntegration' | 'feedbackScreenshotIntegration',
        scriptNonce?: string,
      ) => Promise<IntegrationFn>;
      getModalIntegration?: never;
      getScreenshotIntegration?: never;
    };

export const buildFeedbackIntegration = ({
  lazyLoadIntegration,
  getModalIntegration,
  getScreenshotIntegration,
}: BuilderOptions): IntegrationFn<
  Integration & {
    attachTo(el: Element | string, optionOverrides?: OverrideFeedbackConfiguration): Unsubscribe;
    createForm(
      optionOverrides?: OverrideFeedbackConfiguration,
    ): Promise<ReturnType<FeedbackModalIntegration['createDialog']>>;
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
    styleNonce,
    scriptNonce,

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
    triggerAriaLabel = '',
    highlightToolText = HIGHLIGHT_TOOL_TEXT,
    hideToolText = HIDE_TOOL_TEXT,
    removeHighlightText = REMOVE_HIGHLIGHT_TEXT,

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
      styleNonce,
      scriptNonce,

      colorScheme,
      themeDark,
      themeLight,

      triggerLabel,
      triggerAriaLabel,
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
      highlightToolText,
      hideToolText,
      removeHighlightText,

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
      return _shadow;
    };

    const _loadAndRenderDialog = async (
      options: FeedbackInternalOptions,
    ): Promise<ReturnType<FeedbackModalIntegration['createDialog']>> => {
      const screenshotRequired = options.enableScreenshot && isScreenshotSupported();

      let modalIntegration: FeedbackModalIntegration;
      let screenshotIntegration: FeedbackScreenshotIntegration | undefined;

      try {
        const modalIntegrationFn = getModalIntegration
          ? getModalIntegration()
          : await lazyLoadIntegration('feedbackModalIntegration', scriptNonce);
        modalIntegration = modalIntegrationFn() as FeedbackModalIntegration;
        addIntegration(modalIntegration);
      } catch {
        DEBUG_BUILD &&
          debug.error(
            '[Feedback] Error when trying to load feedback integrations. Try using `feedbackSyncIntegration` in your `Sentry.init`.',
          );
        throw new Error('[Feedback] Missing feedback modal integration!');
      }

      try {
        const screenshotIntegrationFn = screenshotRequired
          ? getScreenshotIntegration
            ? getScreenshotIntegration()
            : await lazyLoadIntegration('feedbackScreenshotIntegration', scriptNonce)
          : undefined;

        if (screenshotIntegrationFn) {
          screenshotIntegration = screenshotIntegrationFn() as FeedbackScreenshotIntegration;
          addIntegration(screenshotIntegration);
        }
      } catch {
        DEBUG_BUILD &&
          debug.error('[Feedback] Missing feedback screenshot integration. Proceeding without screenshots.');
      }

      const dialog = modalIntegration.createDialog({
        options: {
          ...options,
          onFormClose: () => {
            dialog?.close();
            options.onFormClose?.();
          },
          onFormSubmitted: () => {
            dialog?.close();
            options.onFormSubmitted?.();
          },
        },
        screenshotIntegration,
        sendFeedback,
        shadow: _createShadow(options),
      });

      return dialog;
    };

    const _attachTo = (el: Element | string, optionOverrides: OverrideFeedbackConfiguration = {}): Unsubscribe => {
      const mergedOptions = mergeOptions(_options, optionOverrides);

      const targetEl =
        typeof el === 'string' ? DOCUMENT.querySelector(el) : typeof el.addEventListener === 'function' ? el : null;

      if (!targetEl) {
        DEBUG_BUILD && debug.error('[Feedback] Unable to attach to target element');
        throw new Error('Unable to attach to target element');
      }

      let dialog: ReturnType<FeedbackModalIntegration['createDialog']> | null = null;
      const handleClick = async (): Promise<void> => {
        if (!dialog) {
          dialog = await _loadAndRenderDialog({
            ...mergedOptions,
            onFormSubmitted: () => {
              dialog?.removeFromDom();
              mergedOptions.onFormSubmitted?.();
            },
          });
        }
        dialog.appendToDom();
        dialog.open();
      };
      targetEl.addEventListener('click', handleClick);
      const unsubscribe = (): void => {
        _subscriptions = _subscriptions.filter(sub => sub !== unsubscribe);
        dialog?.removeFromDom();
        dialog = null;
        targetEl.removeEventListener('click', handleClick);
      };
      _subscriptions.push(unsubscribe);
      return unsubscribe;
    };

    const _createActor = (optionOverrides: OverrideFeedbackConfiguration = {}): ActorComponent => {
      const mergedOptions = mergeOptions(_options, optionOverrides);
      const shadow = _createShadow(mergedOptions);
      const actor = Actor({
        triggerLabel: mergedOptions.triggerLabel,
        triggerAriaLabel: mergedOptions.triggerAriaLabel,
        shadow,
        styleNonce,
      });
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
          DOCUMENT.addEventListener('DOMContentLoaded', () => _createActor().appendToDom());
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
      async createForm(
        optionOverrides: OverrideFeedbackConfiguration = {},
      ): Promise<ReturnType<FeedbackModalIntegration['createDialog']>> {
        return _loadAndRenderDialog(mergeOptions(_options, optionOverrides));
      },

      /**
       * Removes the Feedback integration (including host, shadow DOM, and all widgets)
       */
      remove(): void {
        if (_shadow) {
          _shadow.parentElement?.remove();
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
