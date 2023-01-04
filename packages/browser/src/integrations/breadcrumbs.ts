/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable max-lines */
import { getCurrentHub } from '@sentry/core';
import type { Event, Integration } from '@sentry/types';
import {
  addInstrumentationHandler,
  getEventDescription,
  htmlTreeAsString,
  logger,
  parseUrl,
  safeJoin,
  severityLevelFromString,
} from '@sentry/utils';

import { WINDOW } from '../helpers';

/** JSDoc */
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

export const BREADCRUMB_INTEGRATION_ID = 'Breadcrumbs';

/**
 * Default Breadcrumbs instrumentations
 * TODO: Deprecated - with v6, this will be renamed to `Instrument`
 */
export class Breadcrumbs implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = BREADCRUMB_INTEGRATION_ID;

  /**
   * @inheritDoc
   */
  public name: string = Breadcrumbs.id;

  /**
   * Options of the breadcrumbs integration.
   */
  // This field is public, because we use it in the browser client to check if the `sentry` option is enabled.
  public readonly options: Readonly<BreadcrumbsOptions>;

  /**
   * @inheritDoc
   */
  public constructor(options?: Partial<BreadcrumbsOptions>) {
    this.options = {
      console: true,
      dom: true,
      fetch: true,
      history: true,
      sentry: true,
      xhr: true,
      ...options,
    };
  }

  /**
   * Instrument browser built-ins w/ breadcrumb capturing
   *  - Console API
   *  - DOM API (click/typing)
   *  - XMLHttpRequest API
   *  - Fetch API
   *  - History API
   */
  public setupOnce(): void {
    if (this.options.console) {
      addInstrumentationHandler('console', _consoleBreadcrumb);
    }
    if (this.options.dom) {
      addInstrumentationHandler('dom', _domBreadcrumb(this.options.dom));
    }
    if (this.options.xhr) {
      addInstrumentationHandler('xhr', _xhrBreadcrumb);
    }
    if (this.options.fetch) {
      addInstrumentationHandler('fetch', _fetchBreadcrumb);
    }
    if (this.options.history) {
      addInstrumentationHandler('history', _historyBreadcrumb);
    }
  }

  /**
   * Adds a breadcrumb for Sentry events or transactions if this option is enabled.
   */
  public addSentryBreadcrumb(event: Event): void {
    if (this.options.sentry) {
      getCurrentHub().addBreadcrumb(
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
    }
  }
}

/**
 * A HOC that creaes a function that creates breadcrumbs from DOM API calls.
 * This is a HOC so that we get access to dom options in the closure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _domBreadcrumb(dom: BreadcrumbsOptions['dom']): (handlerData: { [key: string]: any }) => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function _innerDomBreadcrumb(handlerData: { [key: string]: any }): void {
    let target;
    let keyAttrs = typeof dom === 'object' ? dom.serializeAttribute : undefined;

    let maxStringLength =
      typeof dom === 'object' && typeof dom.maxStringLength === 'number' ? dom.maxStringLength : undefined;
    if (maxStringLength && maxStringLength > MAX_ALLOWED_STRING_LENGTH) {
      __DEBUG_BUILD__ &&
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
      target = handlerData.event.target
        ? htmlTreeAsString(handlerData.event.target as Node, { keyAttrs, maxStringLength })
        : htmlTreeAsString(handlerData.event as unknown as Node, { keyAttrs, maxStringLength });
    } catch (e) {
      target = '<unknown>';
    }

    if (target.length === 0) {
      return;
    }

    getCurrentHub().addBreadcrumb(
      {
        category: `ui.${handlerData.name}`,
        message: target,
      },
      {
        event: handlerData.event,
        name: handlerData.name,
        global: handlerData.global,
      },
    );
  }

  return _innerDomBreadcrumb;
}

/**
 * Creates breadcrumbs from console API calls
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _consoleBreadcrumb(handlerData: { [key: string]: any }): void {
  // This is a hack to fix a Vue3-specific bug that causes an infinite loop of
  // console warnings. This happens when a Vue template is rendered with
  // an undeclared variable, which we try to stringify, ultimately causing
  // Vue to issue another warning which repeats indefinitely.
  // see: https://github.com/getsentry/sentry-javascript/pull/6010
  // see: https://github.com/getsentry/sentry-javascript/issues/5916
  for (let i = 0; i < handlerData.args.length; i++) {
    if (handlerData.args[i] === 'ref=Ref<') {
      handlerData.args[i + 1] = 'viewRef';
      break;
    }
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

  getCurrentHub().addBreadcrumb(breadcrumb, {
    input: handlerData.args,
    level: handlerData.level,
  });
}

/**
 * Creates breadcrumbs from XHR API calls
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _xhrBreadcrumb(handlerData: { [key: string]: any }): void {
  if (handlerData.endTimestamp) {
    // We only capture complete, non-sentry requests
    if (handlerData.xhr.__sentry_own_request__) {
      return;
    }

    const { method, url, status_code, body } = handlerData.xhr.__sentry_xhr__ || {};

    getCurrentHub().addBreadcrumb(
      {
        category: 'xhr',
        data: {
          method,
          url,
          status_code,
        },
        type: 'http',
      },
      {
        xhr: handlerData.xhr,
        input: body,
      },
    );

    return;
  }
}

/**
 * Creates breadcrumbs from fetch API calls
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _fetchBreadcrumb(handlerData: { [key: string]: any }): void {
  // We only capture complete fetch requests
  if (!handlerData.endTimestamp) {
    return;
  }

  if (handlerData.fetchData.url.match(/sentry_key/) && handlerData.fetchData.method === 'POST') {
    // We will not create breadcrumbs for fetch requests that contain `sentry_key` (internal sentry requests)
    return;
  }

  if (handlerData.error) {
    getCurrentHub().addBreadcrumb(
      {
        category: 'fetch',
        data: handlerData.fetchData,
        level: 'error',
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
        data: {
          ...handlerData.fetchData,
          status_code: handlerData.response.status,
        },
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _historyBreadcrumb(handlerData: { [key: string]: any }): void {
  let from = handlerData.from;
  let to = handlerData.to;
  const parsedLoc = parseUrl(WINDOW.location.href);
  let parsedFrom = parseUrl(from);
  const parsedTo = parseUrl(to);

  // Initial pushState doesn't provide `from` information
  if (!parsedFrom.path) {
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

  getCurrentHub().addBreadcrumb({
    category: 'navigation',
    data: {
      from,
      to,
    },
  });
}
