import type { Client, Event as SentryEvent, HandlerDataConsole, IntegrationFn } from '@sentry/core';
import {
  addBreadcrumb,
  addConsoleInstrumentationHandler,
  debug,
  defineIntegration,
  getClient,
  getEventDescription,
  safeJoin,
  severityLevelFromString,
} from '@sentry/core';

interface BreadcrumbsOptions {
  console: boolean;
  sentry: boolean;

  /**
   * @deprecated Fetch breadcrumbs are recorded by `fetchIntegration`. Disable them with
   * `fetchIntegration({ breadcrumbs: false })` instead. This option no longer has any effect and
   * will be removed in a future major version.
   */
  fetch: boolean;
}

const INTEGRATION_NAME = 'Breadcrumbs' as const;

/**
 * Note: This `breadcrumbsIntegration` is almost the same as the one from @sentry/browser.
 * The Deno-version does not support browser-specific APIs like dom, xhr and history.
 */
const _breadcrumbsIntegration = ((options: Partial<BreadcrumbsOptions> = {}) => {
  const _options = {
    console: true,
    fetch: true,
    sentry: true,
    ...options,
  };

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      // TODO(v11): Remove this functionality and use `consoleIntegration` from @sentry/core instead.
      if (_options.console) {
        addConsoleInstrumentationHandler(_getConsoleBreadcrumbHandler(client));
      }
      // oxlint-disable-next-line typescript/no-deprecated
      if (!_options.fetch) {
        debug.warn(
          'breadcrumbsIntegration({ fetch: false }) no longer has any effect. Fetch breadcrumbs are recorded by fetchIntegration; disable them with fetchIntegration({ breadcrumbs: false }).',
        );
      }
      if (_options.sentry) {
        client.on('beforeSendEvent', _getSentryBreadcrumbHandler(client));
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds breadcrumbs for console and sentry events.
 *
 * Fetch breadcrumbs come from `fetchIntegration`.
 *
 * Enabled by default in the Deno SDK.
 *
 * ```js
 * Sentry.init({
 *   integrations: [
 *     Sentry.breadcrumbsIntegration(),
 *   ],
 * })
 * ```
 */
export const breadcrumbsIntegration = defineIntegration(_breadcrumbsIntegration);

/**
 * Adds a breadcrumb for Sentry events or transactions if this option is enabled.
 *
 */
function _getSentryBreadcrumbHandler(client: Client): (event: SentryEvent) => void {
  return function addSentryBreadcrumb(event: SentryEvent): void {
    if (getClient() !== client) {
      return;
    }

    addBreadcrumb(
      {
        category: `sentry.${event.type === 'transaction' ? 'transaction' : 'event'}`,
        event_id: event.event_id,
        level: event.level,
        message: getEventDescription(event),
      },
      {
        event,
      },
    );
  };
}

/**
 * Creates breadcrumbs from console API calls
 */
function _getConsoleBreadcrumbHandler(client: Client): (handlerData: HandlerDataConsole) => void {
  return function _consoleBreadcrumb(handlerData: HandlerDataConsole): void {
    if (getClient() !== client) {
      return;
    }

    const breadcrumb = {
      category: 'console',
      data: {
        arguments: handlerData.args,
        logger: 'console',
      },
      level: severityLevelFromString(handlerData.level),
      message: safeJoin(handlerData.args, ' '),
    };

    if (handlerData.level === 'assert') {
      if (handlerData.args[0] === false) {
        breadcrumb.message = `Assertion failed: ${safeJoin(handlerData.args.slice(1), ' ') || 'console.assert'}`;
        breadcrumb.data.arguments = handlerData.args.slice(1);
      } else {
        // Don't capture a breadcrumb for passed assertions
        return;
      }
    }

    addBreadcrumb(breadcrumb, {
      input: handlerData.args,
      level: handlerData.level,
    });
  };
}
