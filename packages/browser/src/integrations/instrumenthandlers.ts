import { API, getCurrentHub } from '@sentry/core';
import { Severity } from '@sentry/types';
import { getEventDescription, getGlobalObject, logger, normalize, parseUrl, safeJoin } from '@sentry/utils';

import { BrowserClient } from '../client';

const global = getGlobalObject<Window>();

/** Object describing handler that will be triggered for a given `type` of instrumentation */
export interface InstrumentHandler {
  type: InstrumentHandlerType;
  callback: InstrumentHandlerCallback;
}
export type InstrumentHandlerType = 'console' | 'dom' | 'fetch' | 'history' | 'sentry' | 'xhr';
export type InstrumentHandlerCallback = (data: any) => void;

/**
 * Create a breadcrumb of `sentry` from the events themselves
 */
function addSentryBreadcrumb(serializedData: string): void {
  // There's always something that can go wrong with deserialization...
  try {
    const event = JSON.parse(serializedData);
    getCurrentHub().addBreadcrumb(
      {
        category: 'sentry',
        event_id: event.event_id,
        level: event.level || Severity.fromString('error'),
        message: getEventDescription(event),
      },
      {
        event,
      },
    );
  } catch (_oO) {
    logger.error('Error while adding sentry type breadcrumb');
  }
}

/**
 * Creates breadcrumbs from console API calls
 */
function consoleBreadcrumb(handlerData: { [key: string]: any }): void {
  const breadcrumb = {
    category: 'console',
    data: {
      extra: {
        arguments: normalize(handlerData.args, 3),
      },
      logger: 'console',
    },
    level: Severity.fromString(handlerData.level),
    message: safeJoin(handlerData.args, ' '),
  };

  if (handlerData.level === 'assert') {
    if (handlerData.args[0] === false) {
      breadcrumb.message = `Assertion failed: ${safeJoin(handlerData.args.slice(1), ' ') || 'console.assert'}`;
      breadcrumb.data.extra.arguments = normalize(handlerData.args.slice(1), 3);
    } else {
      // Don't capture a breadcrumb for passed assertions
      return;
    }
  }

  getCurrentHub().addBreadcrumb(breadcrumb, {
    input: handlerData.args,
    level: handlerData.level,
  });
}

/**
 * Creates breadcrumbs from XHR API calls
 */
function xhrBreadcrumb(handlerData: { [key: string]: any }): void {
  if (handlerData.requestComplete) {
    // We only capture complete, non-sentry requests
    if (handlerData.xhr.__sentry_own_request__) {
      return;
    }

    getCurrentHub().addBreadcrumb(
      {
        category: 'xhr',
        data: handlerData.xhr.__sentry_xhr__,
        type: 'http',
      },
      {
        xhr: handlerData.xhr,
      },
    );

    return;
  }

  // We only capture issued sentry requests
  if (handlerData.xhr.__sentry_own_request__) {
    addSentryBreadcrumb(handlerData.args[0]);
  }
}

/**
 * Creates breadcrumbs from fetch API calls
 */
function fetchBreadcrumb(handlerData: { [key: string]: any }): void {
  // We only capture complete fetch requests
  if (!handlerData.requestComplete) {
    return;
  }

  const client = getCurrentHub().getClient<BrowserClient>();
  const dsn = client && client.getDsn();

  if (dsn) {
    const filterUrl = new API(dsn).getStoreEndpoint();
    // if Sentry key appears in URL, don't capture it as a request
    // but rather as our own 'sentry' type breadcrumb
    if (
      filterUrl &&
      handlerData.fetchData.url.indexOf(filterUrl) !== -1 &&
      handlerData.fetchData.method === 'POST' &&
      handlerData.args[1] &&
      handlerData.args[1].body
    ) {
      addSentryBreadcrumb(handlerData.args[1].body);
      return;
    }
  }

  if (handlerData.error) {
    getCurrentHub().addBreadcrumb(
      {
        category: 'fetch',
        data: handlerData.fetchData,
        level: Severity.Error,
        type: 'http',
      },
      {
        data: handlerData.error,
        input: handlerData.args,
      },
    );
  } else {
    getCurrentHub().addBreadcrumb(
      {
        category: 'fetch',
        data: handlerData.fetchData,
        type: 'http',
      },
      {
        input: handlerData.args,
        response: handlerData.response,
      },
    );
  }
}

/**
 * Creates breadcrumbs from history API calls
 */
function historyBreadcrumb(handlerData: { [key: string]: any }): void {
  let from = handlerData.from;
  let to = handlerData.to;

  const parsedLoc = parseUrl(global.location.href);
  let parsedFrom = parseUrl(from);
  const parsedTo = parseUrl(to);

  // Initial pushState doesn't provide `from` information
  if (!parsedFrom.path) {
    parsedFrom = parsedLoc;
  }

  // Use only the path component of the URL if the URL matches the current
  // document (almost all the time when using pushState)
  if (parsedLoc.protocol === parsedTo.protocol && parsedLoc.host === parsedTo.host) {
    // tslint:disable-next-line:no-parameter-reassignment
    to = parsedTo.relative;
  }
  if (parsedLoc.protocol === parsedFrom.protocol && parsedLoc.host === parsedFrom.host) {
    // tslint:disable-next-line:no-parameter-reassignment
    from = parsedFrom.relative;
  }

  getCurrentHub().addBreadcrumb({
    category: 'navigation',
    data: {
      from,
      to,
    },
  });
}

export const consoleBreadcrumbHandler: InstrumentHandler = {
  callback: consoleBreadcrumb,
  type: 'console',
};

export const domBreadcrumbHandler: InstrumentHandler = {
  callback: () => {
    // TODO
  },
  type: 'dom',
};

export const xhrBreadcrumbHandler: InstrumentHandler = {
  callback: xhrBreadcrumb,
  type: 'xhr',
};

export const fetchBreadcrumbHandler: InstrumentHandler = {
  callback: fetchBreadcrumb,
  type: 'fetch',
};

export const historyBreadcrumbHandler: InstrumentHandler = {
  callback: historyBreadcrumb,
  type: 'history',
};

export const defaultHandlers = [
  consoleBreadcrumbHandler,
  domBreadcrumbHandler,
  xhrBreadcrumbHandler,
  fetchBreadcrumbHandler,
  historyBreadcrumbHandler,
];
