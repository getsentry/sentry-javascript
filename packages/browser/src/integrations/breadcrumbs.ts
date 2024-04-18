import {
  SENTRY_XHR_DATA_KEY,
  addClickKeypressInstrumentationHandler,
  addHistoryInstrumentationHandler,
  addXhrInstrumentationHandler,
} from '@sentry-internal/browser-utils';
import { addBreadcrumb, defineIntegration, getClient } from '@sentry/core';
import type {
  Breadcrumb,
  Client,
  Event as SentryEvent,
  FetchBreadcrumbData,
  FetchBreadcrumbHint,
  HandlerDataConsole,
  HandlerDataDom,
  HandlerDataFetch,
  HandlerDataHistory,
  HandlerDataXhr,
  IntegrationFn,
  XhrBreadcrumbData,
  XhrBreadcrumbHint,
} from '@sentry/types';
import {
  addConsoleInstrumentationHandler,
  addFetchInstrumentationHandler,
  getComponentName,
  getEventDescription,
  htmlTreeAsString,
  logger,
  parseUrl,
  safeJoin,
  severityLevelFromString,
} from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';

interface BreadcrumbsOptions {
  console: boolean;
  dom:
    | boolean
    | {
        serializeAttribute?: string | string[];
        maxStringLength?: number;
      };
  fetch: boolean;
  history: boolean;
  sentry: boolean;
  xhr: boolean;
}

/** maxStringLength gets capped to prevent 100 breadcrumbs exceeding 1MB event payload size */
const MAX_ALLOWED_STRING_LENGTH = 1024;

const INTEGRATION_NAME = 'Breadcrumbs';

const _breadcrumbsIntegration = ((options: Partial<BreadcrumbsOptions> = {}) => {
  const _options = {
    console: true,
    dom: true,
    fetch: true,
    history: true,
    sentry: true,
    xhr: true,
    ...options,
  };

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      if (_options.console) {
        addConsoleInstrumentationHandler(_getConsoleBreadcrumbHandler(client));
      }
      if (_options.dom) {
        addClickKeypressInstrumentationHandler(_getDomBreadcrumbHandler(client, _options.dom));
      }
      if (_options.xhr) {
        addXhrInstrumentationHandler(_getXhrBreadcrumbHandler(client));
      }
      if (_options.fetch) {
        addFetchInstrumentationHandler(_getFetchBreadcrumbHandler(client));
      }
      if (_options.history) {
        addHistoryInstrumentationHandler(_getHistoryBreadcrumbHandler(client));
      }
      if (_options.sentry) {
        client.on('beforeSendEvent', _getSentryBreadcrumbHandler(client));
      }
    },
  };
}) satisfies IntegrationFn;

export const breadcrumbsIntegration = defineIntegration(_breadcrumbsIntegration);

/**
 * Adds a breadcrumb for Sentry events or transactions if this option is enabled.
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
 * A HOC that creaes a function that creates breadcrumbs from DOM API calls.
 * This is a HOC so that we get access to dom options in the closure.
 */
function _getDomBreadcrumbHandler(
  client: Client,
  dom: BreadcrumbsOptions['dom'],
): (handlerData: HandlerDataDom) => void {
  return function _innerDomBreadcrumb(handlerData: HandlerDataDom): void {
    if (getClient() !== client) {
      return;
    }

    let target;
    let componentName;
    let keyAttrs = typeof dom === 'object' ? dom.serializeAttribute : undefined;

    let maxStringLength =
      typeof dom === 'object' && typeof dom.maxStringLength === 'number' ? dom.maxStringLength : undefined;
    if (maxStringLength && maxStringLength > MAX_ALLOWED_STRING_LENGTH) {
      DEBUG_BUILD &&
        logger.warn(
          `\`dom.maxStringLength\` cannot exceed ${MAX_ALLOWED_STRING_LENGTH}, but a value of ${maxStringLength} was configured. Sentry will use ${MAX_ALLOWED_STRING_LENGTH} instead.`,
        );
      maxStringLength = MAX_ALLOWED_STRING_LENGTH;
    }

    if (typeof keyAttrs === 'string') {
      keyAttrs = [keyAttrs];
    }

    // Accessing event.target can throw (see getsentry/raven-js#838, #768)
    try {
      const event = handlerData.event as Event | Node;
      const element = _isEvent(event) ? event.target : event;

      target = htmlTreeAsString(element, { keyAttrs, maxStringLength });
      componentName = getComponentName(element);
    } catch (e) {
      target = '<unknown>';
    }

    if (target.length === 0) {
      return;
    }

    const breadcrumb: Breadcrumb = {
      category: `ui.${handlerData.name}`,
      message: target,
    };

    if (componentName) {
      breadcrumb.data = { 'ui.component_name': componentName };
    }

    addBreadcrumb(breadcrumb, {
      event: handlerData.event,
      name: handlerData.name,
      global: handlerData.global,
    });
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
 * Creates breadcrumbs from XHR API calls
 */
function _getXhrBreadcrumbHandler(client: Client): (handlerData: HandlerDataXhr) => void {
  return function _xhrBreadcrumb(handlerData: HandlerDataXhr): void {
    if (getClient() !== client) {
      return;
    }

    const { startTimestamp, endTimestamp } = handlerData;

    const sentryXhrData = handlerData.xhr[SENTRY_XHR_DATA_KEY];

    // We only capture complete, non-sentry requests
    if (!startTimestamp || !endTimestamp || !sentryXhrData) {
      return;
    }

    const { method, url, status_code, body } = sentryXhrData;

    const data: XhrBreadcrumbData = {
      method,
      url,
      status_code,
    };

    const hint: XhrBreadcrumbHint = {
      xhr: handlerData.xhr,
      input: body,
      startTimestamp,
      endTimestamp,
    };

    addBreadcrumb(
      {
        category: 'xhr',
        data,
        type: 'http',
      },
      hint,
    );
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

    if (handlerData.error) {
      const data: FetchBreadcrumbData = handlerData.fetchData;
      const hint: FetchBreadcrumbHint = {
        data: handlerData.error,
        input: handlerData.args,
        startTimestamp,
        endTimestamp,
      };

      addBreadcrumb(
        {
          category: 'fetch',
          data,
          level: 'error',
          type: 'http',
        },
        hint,
      );
    } else {
      const response = handlerData.response as Response | undefined;
      const data: FetchBreadcrumbData = {
        ...handlerData.fetchData,
        status_code: response && response.status,
      };
      const hint: FetchBreadcrumbHint = {
        input: handlerData.args,
        response,
        startTimestamp,
        endTimestamp,
      };
      addBreadcrumb(
        {
          category: 'fetch',
          data,
          type: 'http',
        },
        hint,
      );
    }
  };
}

/**
 * Creates breadcrumbs from history API calls
 */
function _getHistoryBreadcrumbHandler(client: Client): (handlerData: HandlerDataHistory) => void {
  return function _historyBreadcrumb(handlerData: HandlerDataHistory): void {
    if (getClient() !== client) {
      return;
    }

    let from: string | undefined = handlerData.from;
    let to: string | undefined = handlerData.to;
    const parsedLoc = parseUrl(WINDOW.location.href);
    let parsedFrom = from ? parseUrl(from) : undefined;
    const parsedTo = parseUrl(to);

    // Initial pushState doesn't provide `from` information
    if (!parsedFrom || !parsedFrom.path) {
      parsedFrom = parsedLoc;
    }

    // Use only the path component of the URL if the URL matches the current
    // document (almost all the time when using pushState)
    if (parsedLoc.protocol === parsedTo.protocol && parsedLoc.host === parsedTo.host) {
      to = parsedTo.relative;
    }
    if (parsedLoc.protocol === parsedFrom.protocol && parsedLoc.host === parsedFrom.host) {
      from = parsedFrom.relative;
    }

    addBreadcrumb({
      category: 'navigation',
      data: {
        from,
        to,
      },
    });
  };
}

function _isEvent(event: unknown): event is Event {
  return !!event && !!(event as Record<string, unknown>).target;
}
