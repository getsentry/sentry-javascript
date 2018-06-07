import { addBreadcrumb, getCurrentClient } from '@sentry/shim';
import { Integration } from '@sentry/types';
import { fill } from '@sentry/utils';
import { ClientRequest, ClientRequestArgs, ServerResponse } from 'http';
import { inherits } from 'util';

// TODO: find out what type is http itself

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
    const MODULE = require('module');
    let lastResponse: ServerResponse | undefined;

    /**
     * Wrapper function for internal _load calls within `require`
     */
    function loadWrapper(origLoad: () => any): any {
      return function(moduleId: string): void {
        const origModule = origLoad.apply(MODULE, arguments);

        if (moduleId !== 'http') {
          return origModule;
        }

        const origClientRequest = origModule.ClientRequest;
        const clientRequest = function(
          options: ClientRequestArgs | string,
          callback: () => void,
        ): any {
          // Note: this won't capture a breadcrumb if a response never comes
          // It would be useful to know if that was the case, though, so
          // todo: revisit to see if we can capture sth indicating response never came
          // possibility: capture one breadcrumb for "req sent" and one for "res recvd"
          // seems excessive but solves the problem and *is* strictly more information
          // could be useful for weird response sequencing bug scenarios

          // @ts-ignore
          origClientRequest.call(this, options, callback);

          // We could just always reconstruct this from this.agent, this._headers, this.path, etc
          // but certain other http-instrumenting libraries (like nock, which we use for tests) fail to
          // maintain the guarantee that after calling origClientRequest, those fields will be populated
          if (typeof options === 'string') {
            // @ts-ignore
            this.__ravenBreadcrumbUrl = options;
          } else {
            const protocol = options.protocol || '';
            const hostname = options.hostname || options.host || '';
            // Don't log standard :80 (http) and :443 (https) ports to reduce the noise
            const port =
              !options.port || options.port === 80 || options.port === 443
                ? ''
                : `:${options.port as string}`;
            const path = options.path || '/';

            // @ts-ignore
            this.__ravenBreadcrumbUrl = `${protocol}//${hostname}${port}${path}`;
          }
        };

        inherits(clientRequest, origClientRequest);

        /**
         * Wrapper function for request's `emit` calls
         */
        function emitWrapper(
          origEmit: EventListener,
        ): (event: string, response: ServerResponse) => EventListener {
          return function(event: string, response: ServerResponse): any {
            // I'm not sure why but Node.js (at least in v8.X)
            // is emitting all events twice :|
            if (lastResponse === undefined || lastResponse !== response) {
              lastResponse = response;
            } else {
              // @ts-ignore
              return origEmit.apply(this, arguments);
            }

            const DSN = getCurrentClient().getDSN();

            const isInterestingEvent =
              event === 'response' || event === 'error';
            const isNotSentryRequest =
              // @ts-ignore
              DSN && !this.__ravenBreadcrumbUrl.includes(DSN.host);

            if (isInterestingEvent && isNotSentryRequest) {
              addBreadcrumb({
                category: 'http',
                data: {
                  // @ts-ignore
                  method: this.method,
                  status_code: response.statusCode,
                  // @ts-ignore
                  url: this.__ravenBreadcrumbUrl,
                },
                type: 'http',
              });
            }

            // @ts-ignore
            return origEmit.apply(this, arguments);
          };
        }

        // @ts-ignore
        fill(clientRequest.prototype, 'emit', emitWrapper);

        fill(origModule, 'ClientRequest', function(): any {
          return clientRequest;
        });

        // http.request orig refs module-internal ClientRequest, not exported one, so
        // it still points at orig ClientRequest after our monkeypatch; these reimpls
        // just get that reference updated to use our new ClientRequest
        fill(origModule, 'request', function(): any {
          return function(
            options: ClientRequestArgs,
            callback: () => void,
          ): any {
            return new origModule.ClientRequest(
              options,
              callback,
            ) as ClientRequest;
          };
        });

        fill(origModule, 'get', function(): any {
          return function(
            options: ClientRequestArgs,
            callback: () => void,
          ): any {
            const req = origModule.request(options, callback);
            req.end();
            return req;
          };
        });

        return origModule;
      };
    }

    // @ts-ignore
    fill(MODULE, '_load', loadWrapper);

    // observation: when the https module does its own require('http'), it *does not* hit our hooked require to instrument http on the fly
    // but if we've previously instrumented http, https *does* get our already-instrumented version
    // this is because raven's transports are required before this instrumentation takes place, which loads https (and http)
    // so module cache will have uninstrumented http; proactively loading it here ensures instrumented version is in module cache
    // alternatively we could refactor to load our transports later, but this is easier and doesn't have much drawback
    require('http');
  }
}
