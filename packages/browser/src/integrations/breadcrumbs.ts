import { API, getCurrentHub } from '@sentry/core';
import { Integration, Severity } from '@sentry/types';
import {
  addInstrumentationHandler,
  getEventDescription,
  getGlobalObject,
  htmlTreeAsString,
  logger,
  parseUrl,
  safeJoin,
} from '@sentry/utils';

import { BrowserClient } from '../client';

/**
 * @hidden
 */
export interface SentryWrappedXMLHttpRequest extends XMLHttpRequest {
  [key: string]: any;
  __sentry_xhr__?: {
    method?: string;
    url?: string;
    status_code?: number;
  };
}

/** JSDoc */
interface BreadcrumbIntegrations {
  console?: boolean;
  dom?: boolean;
  fetch?: boolean;
  history?: boolean;
  sentry?: boolean;
  xhr?: boolean;
}

/**
 * Default Breadcrumbs instrumentations
 * TODO: Deprecated - with v6, this will be renamed to `Instrument`
 */
export class Breadcrumbs implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = Breadcrumbs.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'Breadcrumbs';

  /** JSDoc */
  private readonly _options: BreadcrumbIntegrations;

  /**
   * @inheritDoc
   */
  public constructor(options?: BreadcrumbIntegrations) {
    this._options = {
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
   * Creates breadcrumbs from console API calls
   */
  private _consoleBreadcrumb(handlerData: { [key: string]: any }): void {
    const breadcrumb = {
      category: 'console',
      data: {
        arguments: handlerData.args,
        logger: 'console',
      },
      level: Severity.fromString(handlerData.level),
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
   * Creates breadcrumbs from DOM API calls
   */
  private _domBreadcrumb(handlerData: { [key: string]: any }): void {
    let target;

    // Accessing event.target can throw (see getsentry/raven-js#838, #768)
    try {
      target = handlerData.event.target
        ? htmlTreeAsString(handlerData.event.target as Node)
        : htmlTreeAsString((handlerData.event as unknown) as Node);
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
        event,
        name: handlerData.name,
      },
    );
  }

  /**
   * Creates breadcrumbs from XHR API calls
   */
  private _xhrBreadcrumb(handlerData: { [key: string]: any }): void {
    if (handlerData.endTimestamp) {
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
  private _fetchBreadcrumb(handlerData: { [key: string]: any }): void {
    // We only capture complete fetch requests
    if (!handlerData.endTimestamp) {
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
          data: {
            ...handlerData.fetchData,
            status_code: handlerData.response.status,
          },
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
  private _historyBreadcrumb(handlerData: { [key: string]: any }): void {
    const global = getGlobalObject<Window>();
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

  /**
   * Instrument browser built-ins w/ breadcrumb capturing
   *  - Console API
   *  - DOM API (click/typing)
   *  - XMLHttpRequest API
   *  - Fetch API
   *  - History API
   */
  public setupOnce(): void {
    if (this._options.console) {
      addInstrumentationHandler({
        callback: (...args) => {
          this._consoleBreadcrumb(...args);
        },
        type: 'console',
      });
    }
    if (this._options.dom) {
      addInstrumentationHandler({
        callback: (...args) => {
          this._domBreadcrumb(...args);
        },
        type: 'dom',
      });
    }
    if (this._options.xhr) {
      addInstrumentationHandler({
        callback: (...args) => {
          this._xhrBreadcrumb(...args);
        },
        type: 'xhr',
      });
    }
    if (this._options.fetch) {
      addInstrumentationHandler({
        callback: (...args) => {
          this._fetchBreadcrumb(...args);
        },
        type: 'fetch',
      });
    }
    if (this._options.history) {
      addInstrumentationHandler({
        callback: (...args) => {
          this._historyBreadcrumb(...args);
        },
        type: 'history',
      });
    }
  }
}

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
