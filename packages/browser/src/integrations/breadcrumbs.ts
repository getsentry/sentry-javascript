/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable max-lines */
import { BreadcrumbHint, EventProcessor, Hub, Integration, Severity } from '@sentry/types';
import {
  addInstrumentationHandler,
  getEventDescription,
  getGlobalObject,
  htmlTreeAsString,
  parseUrl,
  safeJoin,
} from '@sentry/utils';

const CONSOLE = 'console';
const FETCH = 'fetch';
const HISTORY = 'history';
const DOM = 'dom';
const XHR = 'xhr';

type AddBreadcrumb = Hub['addBreadcrumb'];
type AddBreadcrumbParams = Parameters<AddBreadcrumb>;

/** JSDoc */
interface BreadcrumbsOptions {
  console: boolean;
  dom: boolean | { serializeAttribute: string | string[] };
  fetch: boolean;
  history: boolean;
  sentry: boolean;
  xhr: boolean;
}

const global = getGlobalObject<Window>();

/**
 * Default Breadcrumbs instrumentations
 */
export class Breadcrumbs implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Breadcrumbs';

  /**
   * @inheritDoc
   */
  public name: string = Breadcrumbs.id;

  /** JSDoc */
  private readonly _options: BreadcrumbsOptions;

  /**
   * @inheritDoc
   */
  public constructor(options?: Partial<BreadcrumbsOptions>) {
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
   * Instrument browser built-ins w/ breadcrumb capturing
   *  - Console API
   *  - DOM API (click/typing)
   *  - XMLHttpRequest API
   *  - Fetch API
   *  - History API
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    const hub = getCurrentHub();

    // Alias the addBreadcrumb function to save on bundle size
    function addBreadcrumb(
      breadcrumb: AddBreadcrumbParams[0],
      breadcrumbHint: AddBreadcrumbParams[1],
    ): ReturnType<AddBreadcrumb> {
      hub.addBreadcrumb(breadcrumb, breadcrumbHint);
    }

    addGlobalEventProcessor(event => {
      if (this._options.sentry) {
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
      }
      return event;
    });

    if (this._options.console) {
      _addConsoleBreadcrumbs(addBreadcrumb);
    }
    if (this._options.dom) {
      _addDomBreadcrumbs(addBreadcrumb, this._options.dom);
    }
    if (this._options.xhr) {
      _addXhrBreadcrumbs(addBreadcrumb);
    }
    if (this._options.fetch) {
      _addFetchBreadcrumbs(addBreadcrumb);
    }
    if (this._options.history) {
      _addHistoryBreadcrumbs(addBreadcrumb);
    }
  }
}

/**
 * Creates breadcrumbs from console API calls
 */
function _addConsoleBreadcrumbs(addBreadcrumb: AddBreadcrumb): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addInstrumentationHandler((handlerData: { [key: string]: any }): void => {
    const breadcrumb = {
      category: CONSOLE,
      data: {
        arguments: handlerData.args,
        logger: CONSOLE,
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

    addBreadcrumb(breadcrumb, {
      input: handlerData.args,
      level: handlerData.level,
    });
  }, CONSOLE);
}

/**
 * Creates breadcrumbs from DOM API calls
 */
function _addDomBreadcrumbs(addBreadcrumb: AddBreadcrumb, dom: BreadcrumbsOptions['dom']): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addInstrumentationHandler((handlerData: { [key: string]: any }): void => {
    const { event, name, global } = handlerData;
    let keyAttrs = typeof dom === 'object' ? dom.serializeAttribute : undefined;

    if (typeof keyAttrs === 'string') {
      keyAttrs = [keyAttrs];
    }

    // Accessing event.target can throw (see getsentry/raven-js#838, #768)
    let target;
    try {
      target = event.target
        ? htmlTreeAsString(event.target as Node, keyAttrs)
        : htmlTreeAsString((event as unknown) as Node, keyAttrs);
    } catch (e) {
      target = '<unknown>';
    }

    if (target) {
      addBreadcrumb(
        {
          category: `ui.${name}`,
          message: target,
        },
        {
          event,
          name,
          global,
        },
      );
    }
  }, DOM);
}

/**
 * Creates breadcrumbs from XHR API calls
 */
function _addXhrBreadcrumbs(addBreadcrumb: AddBreadcrumb): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addInstrumentationHandler((handlerData: { [key: string]: any }): void => {
    if (handlerData.endTimestamp) {
      // We only capture complete, non-sentry requests
      if (handlerData.xhr.__sentry_own_request__) {
        return;
      }

      const { method, url, status_code, body } = handlerData.xhr.__sentry_xhr__ || {};

      addBreadcrumb(
        {
          category: XHR,
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
    }
  }, XHR);
}

/**
 * Creates breadcrumbs from fetch API calls
 */
function _addFetchBreadcrumbs(addBreadcrumb: AddBreadcrumb): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addInstrumentationHandler((handlerData: { [key: string]: any }): void => {
    // We only capture complete fetch requests
    // We will not create breadcrumbs for fetch requests that contain `sentry_key` (internal sentry requests)
    if (
      !handlerData.endTimestamp ||
      (handlerData.fetchData.url.match(/sentry_key/) && handlerData.fetchData.method === 'POST')
    ) {
      return;
    }

    const breadcrumb = {
      category: FETCH,
      data: handlerData.fetchData,
      level: Severity.Error,
      type: 'http',
    };
    const breadcrumbHint = {
      input: handlerData.args,
    } as BreadcrumbHint;

    if (handlerData.error) {
      breadcrumbHint.data = handlerData.error;
      addBreadcrumb(breadcrumb, breadcrumbHint);
    } else {
      breadcrumb.data.status_code = handlerData.response.status;
      breadcrumbHint.response = handlerData.response;
      addBreadcrumb(breadcrumb, breadcrumbHint);
    }
  }, FETCH);
}

/**
 * Creates breadcrumbs from history API calls
 */
function _addHistoryBreadcrumbs(addBreadcrumb: AddBreadcrumb): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addInstrumentationHandler((handlerData: { [key: string]: any }): void => {
    let { from, to } = handlerData;
    const parsedLoc = parseUrl(global.location.href);
    let parsedFrom = parseUrl(from);
    const parsedTo = parseUrl(to);

    // Initial pushState doesn't provide `from` information
    if (!parsedFrom.path) {
      parsedFrom = parsedLoc;
    }

    // Use only the path component of the URL if the URL matches the current
    // document (almost all the time when using pushState)
    const parsedLocProtocol = parsedLoc.protocol;
    if (parsedLocProtocol === parsedTo.protocol && parsedLoc.host === parsedTo.host) {
      to = parsedTo.relative;
    }
    if (parsedLocProtocol === parsedFrom.protocol && parsedLoc.host === parsedFrom.host) {
      from = parsedFrom.relative;
    }

    addBreadcrumb({
      category: 'navigation',
      data: {
        from,
        to,
      },
    });
  }, HISTORY);
}
