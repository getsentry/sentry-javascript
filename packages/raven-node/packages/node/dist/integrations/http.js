"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var shim_1 = require("@sentry/shim");
var utils_1 = require("@sentry/utils");
var util_1 = require("util");
var lastResponse;
/**
 * Function that can combine together a url that'll be used for our breadcrumbs.
 *
 * @param options url that should be returned or an object containing it's parts.
 * @returns constructed url
 */
function createBreadcrumbUrl(options) {
    // We could just always reconstruct this from this.agent, this._headers, this.path, etc
    // but certain other http-instrumenting libraries (like nock, which we use for tests) fail to
    // maintain the guarantee that after calling origClientRequest, those fields will be populated
    if (typeof options === 'string') {
        return options;
    }
    else {
        var protocol = options.protocol || '';
        var hostname = options.hostname || options.host || '';
        // Don't log standard :80 (http) and :443 (https) ports to reduce the noise
        var port = !options.port || options.port === 80 || options.port === 443
            ? ''
            : ":" + options.port;
        var path = options.path || '/';
        return protocol + "//" + hostname + port + path;
    }
}
/**
 * Wrapper function for internal _load calls within `require`
 */
function loadWrapper(nativeModule) {
    // We need to use some functional-style currying to pass values around
    // as we cannot rely on `bind`, because this has to preserve correct
    // context for native calls
    return function (originalLoad) {
        return function (moduleId) {
            var originalModule = originalLoad.apply(nativeModule, arguments);
            if (moduleId !== 'http') {
                return originalModule;
            }
            var origClientRequest = originalModule.ClientRequest;
            var clientRequest = function (options, callback) {
                // Note: this won't capture a breadcrumb if a response never comes
                // It would be useful to know if that was the case, though, so
                // todo: revisit to see if we can capture sth indicating response never came
                // possibility: capture one breadcrumb for "req sent" and one for "res recvd"
                // seems excessive but solves the problem and *is* strictly more information
                // could be useful for weird response sequencing bug scenarios
                origClientRequest.call(this, options, callback);
                this.__ravenBreadcrumbUrl = createBreadcrumbUrl(options);
            };
            util_1.inherits(clientRequest, origClientRequest);
            utils_1.fill(clientRequest.prototype, 'emit', emitWrapper);
            utils_1.fill(originalModule, 'ClientRequest', function () {
                return clientRequest;
            });
            // http.request orig refs module-internal ClientRequest, not exported one, so
            // it still points at orig ClientRequest after our monkeypatch; these reimpls
            // just get that reference updated to use our new ClientRequest
            utils_1.fill(originalModule, 'request', function () {
                return function (options, callback) {
                    return new originalModule.ClientRequest(options, callback);
                };
            });
            utils_1.fill(originalModule, 'get', function () {
                return function (options, callback) {
                    var req = originalModule.request(options, callback);
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
function emitWrapper(origEmit) {
    return function (event, response) {
        // I'm not sure why but Node.js (at least in v8.X)
        // is emitting all events twice :|
        if (lastResponse === undefined || lastResponse !== response) {
            lastResponse = response;
        }
        else {
            return origEmit.apply(this, arguments);
        }
        var DSN = shim_1.getCurrentClient().getDSN();
        var isInterestingEvent = event === 'response' || event === 'error';
        var isNotSentryRequest = DSN &&
            this.__ravenBreadcrumbUrl &&
            !this.__ravenBreadcrumbUrl.includes(DSN.host);
        if (isInterestingEvent && isNotSentryRequest) {
            shim_1.addBreadcrumb({
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
var Http = /** @class */ (function () {
    function Http() {
        /**
         * @inheritDoc
         */
        this.name = 'Console';
    }
    /**
     * @inheritDoc
     */
    Http.prototype.install = function () {
        var nativeModule = require('module');
        utils_1.fill(nativeModule, '_load', loadWrapper(nativeModule));
        // observation: when the https module does its own require('http'), it *does not* hit our hooked require to instrument http on the fly
        // but if we've previously instrumented http, https *does* get our already-instrumented version
        // this is because raven's transports are required before this instrumentation takes place, which loads https (and http)
        // so module cache will have uninstrumented http; proactively loading it here ensures instrumented version is in module cache
        // alternatively we could refactor to load our transports later, but this is easier and doesn't have much drawback
        require('http');
    };
    return Http;
}());
exports.Http = Http;
//# sourceMappingURL=http.js.map