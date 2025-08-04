import type {
  Client,
  Event as SentryEvent,
  FetchBreadcrumbData,
  FetchBreadcrumbHint,
  HandlerDataConsole,
  HandlerDataFetch,
  IntegrationFn,
} from '@sentry/core';
import {
  addBreadcrumb,
  addConsoleInstrumentationHandler,
  addFetchInstrumentationHandler,
  defineIntegration,
  getBreadcrumbLogLevelFromHttpStatusCode,
  getClient,
  getEventDescription,
  safeJoin,
  severityLevelFromString,
} from '@sentry/core';

interface BreadcrumbsOptions {
  console: boolean;
  fetch: boolean;
  sentry: boolean;
}

const INTEGRATION_NAME = 'Breadcrumbs';

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
      if (_options.fetch) {
        addFetchInstrumentationHandler(_getFetchBreadcrumbHandler(client));
      }
      if (_options.sentry) {
        client.on('beforeSendEvent', _getSentryBreadcrumbHandler(client));
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds a breadcrumbs for console, fetch, and sentry events.
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

/**
 * Creates breadcrumbs from fetch API calls
 */
function _getFetchBreadcrumbHandler(client: Client): (handlerData: HandlerDataFetch) => void {
  return function _fetchBreadcrumb(handlerData: HandlerDataFetch): void {
    if (getClient() !== client) {
      return;
    }

    const { startTimestamp, endTimestamp } = handlerData;

    // We only capture complete fetch requests
    if (!endTimestamp) {
      return;
    }

    if (handlerData.fetchData.url.match(/sentry_key/) && handlerData.fetchData.method === 'POST') {
      // We will not create breadcrumbs for fetch requests that contain `sentry_key` (internal sentry requests)
      return;
    }

    const breadcrumbData: FetchBreadcrumbData = {
      method: handlerData.fetchData.method,
      url: handlerData.fetchData.url,
    };

    if (handlerData.error) {
      const hint: FetchBreadcrumbHint = {
        data: handlerData.error,
        input: handlerData.args,
        startTimestamp,
        endTimestamp,
      };

      addBreadcrumb(
        {
          category: 'fetch',
          data: breadcrumbData,
          level: 'error',
          type: 'http',
        },
        hint,
      );
    } else {
      const response = handlerData.response as Response | undefined;

      breadcrumbData.request_body_size = handlerData.fetchData.request_body_size;
      breadcrumbData.response_body_size = handlerData.fetchData.response_body_size;
      breadcrumbData.status_code = response?.status;

      const hint: FetchBreadcrumbHint = {
        input: handlerData.args,
        response,
        startTimestamp,
        endTimestamp,
      };
      const level = getBreadcrumbLogLevelFromHttpStatusCode(breadcrumbData.status_code);

      addBreadcrumb(
        {
          category: 'fetch',
          data: breadcrumbData,
          type: 'http',
          level,
        },
        hint,
      );
    }
  };
}
