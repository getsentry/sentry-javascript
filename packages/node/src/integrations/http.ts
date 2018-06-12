import { addBreadcrumb, getCurrentClient } from '@sentry/minimal';
import { Integration } from '@sentry/types';
import { fill } from '@sentry/utils';
import { ClientRequest, ClientRequestArgs, ServerResponse } from 'http';
import { inherits } from 'util';

let lastResponse: ServerResponse | undefined;

/**
 * Request interface which can carry around unified url
 * independently of used framework
 */
interface SentryRequest extends Request {
  __ravenBreadcrumbUrl?: string;
}

/**
 * Function that can combine together a url that'll be used for our breadcrumbs.
 *
 * @param options url that should be returned or an object containing it's parts.
 * @returns constructed url
 */
function createBreadcrumbUrl(options: string | ClientRequestArgs): string {
  // We could just always reconstruct this from this.agent, this._headers, this.path, etc
  // but certain other http-instrumenting libraries (like nock, which we use for tests) fail to
  // maintain the guarantee that after calling origClientRequest, those fields will be populated
  if (typeof options === 'string') {
    return options;
  } else {
    const protocol = options.protocol || '';
    const hostname = options.hostname || options.host || '';
    // Don't log standard :80 (http) and :443 (https) ports to reduce the noise
    const port =
      !options.port || options.port === 80 || options.port === 443
        ? ''
        : `:${options.port}`;
    const path = options.path || '/';
    return `${protocol}//${hostname}${port}${path}`;
  }
}

/**
 * Wrapper function for internal _load calls within `require`
 */
function loadWrapper(nativeModule: any): any {
  // We need to use some functional-style currying to pass values around
  // as we cannot rely on `bind`, because this has to preserve correct
  // context for native calls
  return function(originalLoad: () => any): any {
    return function(this: SentryRequest, moduleId: string): any {
      const originalModule = originalLoad.apply(nativeModule, arguments);

      if (moduleId !== 'http') {
        return originalModule;
      }

      const origClientRequest = originalModule.ClientRequest;
      const clientRequest = function(
        this: SentryRequest,
        options: ClientRequestArgs | string,
        callback: () => void,
      ): any {
        // Note: this won't capture a breadcrumb if a response never comes
        // It would be useful to know if that was the case, though, so
        // todo: revisit to see if we can capture sth indicating response never came
        // possibility: capture one breadcrumb for "req sent" and one for "res recvd"
        // seems excessive but solves the problem and *is* strictly more information
        // could be useful for weird response sequencing bug scenarios

        origClientRequest.call(this, options, callback);
        this.__ravenBreadcrumbUrl = createBreadcrumbUrl(options);
      };

      inherits(clientRequest, origClientRequest);

      fill(clientRequest.prototype, 'emit', emitWrapper);

      fill(originalModule, 'ClientRequest', function(): any {
        return clientRequest;
      });

      // http.request orig refs module-internal ClientRequest, not exported one, so
      // it still points at orig ClientRequest after our monkeypatch; these reimpls
      // just get that reference updated to use our new ClientRequest
      fill(originalModule, 'request', function(): any {
        return function(options: ClientRequestArgs, callback: () => void): any {
          return new originalModule.ClientRequest(
            options,
            callback,
          ) as ClientRequest;
        };
      });

      fill(originalModule, 'get', function(): any {
        return function(options: ClientRequestArgs, callback: () => void): any {
          const req = originalModule.request(options, callback);
          req.end();
          return req;
        };
      });

      return originalModule;
    };
  };
}

/**
 * Wrapper function for request's `emit` calls
 */
function emitWrapper(
  origEmit: EventListener,
): (event: string, response: ServerResponse) => EventListener {
  return function(
    this: SentryRequest,
    event: string,
    response: ServerResponse,
  ): any {
    // I'm not sure why but Node.js (at least in v8.X)
    // is emitting all events twice :|
    if (lastResponse === undefined || lastResponse !== response) {
      lastResponse = response;
    } else {
      return origEmit.apply(this, arguments);
    }

    const DSN = getCurrentClient().getDSN();

    const isInterestingEvent = event === 'response' || event === 'error';
    const isNotSentryRequest =
      DSN &&
      this.__ravenBreadcrumbUrl &&
      !this.__ravenBreadcrumbUrl.includes(DSN.host);

    if (isInterestingEvent && isNotSentryRequest) {
      addBreadcrumb({
        category: 'http',
        data: {
          method: this.method,
          status_code: response.statusCode,

          url: this.__ravenBreadcrumbUrl,
        },
        type: 'http',
      });
    }

    return origEmit.apply(this, arguments);
  };
}

/** http module integration */
export class Http implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'Console';
  /**
   * @inheritDoc
   */
  public install(): void {
    const nativeModule = require('module');
    fill(nativeModule, '_load', loadWrapper(nativeModule));
    // observation: when the https module does its own require('http'), it *does not* hit our hooked require to instrument http on the fly
    // but if we've previously instrumented http, https *does* get our already-instrumented version
    // this is because raven's transports are required before this instrumentation takes place, which loads https (and http)
    // so module cache will have uninstrumented http; proactively loading it here ensures instrumented version is in module cache
    // alternatively we could refactor to load our transports later, but this is easier and doesn't have much drawback
    require('http');
  }
}
