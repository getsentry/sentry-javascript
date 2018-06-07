import { Integration } from '@sentry/types';
import { inherits } from 'util';
import { fill } from '@sentry/utils';
import { getCurrentClient, addBreadcrumb } from '@sentry/shim';
import { ClientRequestArgs, RequestOptions, ServerResponse } from 'http';

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
    const Module = require('module');
    let lastResponse: ServerResponse;

    function loadWrapper(origLoad: Function) {
      return function(moduleId: string) {
        const origModule = origLoad.apply(Module, arguments);

        if (moduleId !== 'http') return origModule;

        let OrigClientRequest = origModule.ClientRequest;
        let ClientRequest = function(
          options: ClientRequestArgs,
          callback: Function,
        ) {
          // Note: this won't capture a breadcrumb if a response never comes
          // It would be useful to know if that was the case, though, so
          // todo: revisit to see if we can capture sth indicating response never came
          // possibility: capture one breadcrumb for "req sent" and one for "res recvd"
          // seems excessive but solves the problem and *is* strictly more information
          // could be useful for weird response sequencing bug scenarios

          // @ts-ignore
          OrigClientRequest.call(this, options, callback);

          // We could just always reconstruct this from this.agent, this._headers, this.path, etc
          // but certain other http-instrumenting libraries (like nock, which we use for tests) fail to
          // maintain the guarantee that after calling OrigClientRequest, those fields will be populated
          if (typeof options === 'string') {
            // @ts-ignore
            this.__ravenBreadcrumbUrl = options;
          } else {
            var protocol = options.protocol || '';
            var hostname = options.hostname || options.host || '';
            // Don't log standard :80 (http) and :443 (https) ports to reduce the noise
            var port =
              !options.port || options.port === 80 || options.port === 443
                ? ''
                : ':' + options.port;
            var path = options.path || '/';

            // @ts-ignore
            this.__ravenBreadcrumbUrl =
              protocol + '//' + hostname + port + path;
          }
        };

        inherits(ClientRequest, OrigClientRequest);

        function emitWrapper(origEmit: EventListener) {
          return function(event: string, response: ServerResponse) {
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
              // @ts-ignore
              addBreadcrumb({
                type: 'http',
                category: 'http',
                data: {
                  // @ts-ignore
                  method: this.method,
                  // @ts-ignore
                  url: this.__ravenBreadcrumbUrl,
                  status_code: response.statusCode,
                },
              });
            }

            // @ts-ignore
            return origEmit.apply(this, arguments);
          };
        }

        fill(ClientRequest.prototype, 'emit', emitWrapper);

        fill(origModule, 'ClientRequest', function() {
          return ClientRequest;
        });

        // http.request orig refs module-internal ClientRequest, not exported one, so
        // it still points at orig ClientRequest after our monkeypatch; these reimpls
        // just get that reference updated to use our new ClientRequest
        fill(origModule, 'request', function() {
          return function(options: ClientRequestArgs, callback: Function) {
            return new origModule.ClientRequest(options, callback);
          };
        });

        fill(origModule, 'get', function() {
          return function(options: RequestOptions, callback: Function) {
            var req = origModule.request(options, callback);
            req.end();
            return req;
          };
        });

        return origModule;
      };
    }

    fill(Module, '_load', loadWrapper);

    // observation: when the https module does its own require('http'), it *does not* hit our hooked require to instrument http on the fly
    // but if we've previously instrumented http, https *does* get our already-instrumented version
    // this is because raven's transports are required before this instrumentation takes place, which loads https (and http)
    // so module cache will have uninstrumented http; proactively loading it here ensures instrumented version is in module cache
    // alternatively we could refactor to load our transports later, but this is easier and doesn't have much drawback
    require('http');
  }
}
