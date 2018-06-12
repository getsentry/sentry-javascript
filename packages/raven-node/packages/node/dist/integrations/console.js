"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var shim_1 = require("@sentry/shim");
var types_1 = require("@sentry/types");
var utils_1 = require("@sentry/utils");
var util_1 = require("util");
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
            if (moduleId !== 'console') {
                return originalModule;
            }
            ['debug', 'info', 'warn', 'error', 'log'].forEach(consoleWrapper(originalModule));
            return originalModule;
        };
    };
}
/**
 * Wrapper function that'll be used for every console level
 */
function consoleWrapper(originalModule) {
    return function (level) {
        if (!(level in originalModule)) {
            return;
        }
        utils_1.fill(originalModule, level, function (originalConsoleLevel) {
            var sentryLevel;
            switch (level) {
                case 'debug':
                    sentryLevel = types_1.Severity.Debug;
                    break;
                case 'error':
                    sentryLevel = types_1.Severity.Error;
                    break;
                case 'info':
                    sentryLevel = types_1.Severity.Info;
                    break;
                case 'warn':
                    sentryLevel = types_1.Severity.Warning;
                    break;
                default:
                    sentryLevel = types_1.Severity.Log;
            }
            return function () {
                shim_1.addBreadcrumb({
                    category: 'console',
                    level: sentryLevel,
                    message: util_1.format.apply(undefined, arguments),
                });
                originalConsoleLevel.apply(originalModule, arguments);
            };
        });
    };
}
/** Console module integration */
var Console = /** @class */ (function () {
    function Console() {
        /**
         * @inheritDoc
         */
        this.name = 'Console';
    }
    /**
     * @inheritDoc
     */
    Console.prototype.install = function () {
        var nativeModule = require('module');
        utils_1.fill(nativeModule, '_load', loadWrapper(nativeModule));
        // special case: since console is built-in and app-level code won't require() it, do that here
        require('console');
    };
    return Console;
}());
exports.Console = Console;
//# sourceMappingURL=console.js.map