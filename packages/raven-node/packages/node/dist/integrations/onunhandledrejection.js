"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var shim_1 = require("@sentry/shim");
/** Global Promise Rejection handler */
var OnUnhandledRejection = /** @class */ (function () {
    function OnUnhandledRejection() {
        /**
         * @inheritDoc
         */
        this.name = 'OnUnhandledRejection';
    }
    /**
     * @inheritDoc
     */
    OnUnhandledRejection.prototype.install = function () {
        global.process.on('unhandledRejection', function (reason, promise) {
            if (promise === void 0) { promise = {}; }
            var context = (promise.domain && promise.domain.sentryContext) || {};
            shim_1.withScope(function () {
                shim_1.configureScope(function (scope) {
                    // Preserve backwards compatibility with raven-node for now
                    if (context.user) {
                        scope.setUser(context.user);
                    }
                    if (context.tags) {
                        Object.keys(context.tags).forEach(function (key) {
                            scope.setTag(key, context.tags[key]);
                        });
                    }
                    if (context.extra) {
                        Object.keys(context.extra).forEach(function (key) {
                            scope.setExtra(key, context.extra[key]);
                        });
                    }
                    scope.setExtra('unhandledPromiseRejection', true);
                });
                shim_1.captureException(reason);
            });
        });
    };
    return OnUnhandledRejection;
}());
exports.OnUnhandledRejection = OnUnhandledRejection;
//# sourceMappingURL=onunhandledrejection.js.map