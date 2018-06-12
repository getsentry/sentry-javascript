"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var core_1 = require("@sentry/core");
var shim_1 = require("@sentry/shim");
var client_1 = require("./client");
var integrations_1 = require("./integrations");
/**
 * The Sentry Node SDK Client.
 *
 * To use this SDK, call the {@link init} function as early as possible in the
 * main entry module. To set context information or send manual events, use the
 * provided methods.
 *
 * @example
 * const { init } = require('@sentry/node');
 *
 * init({
 *   dsn: '__DSN__',
 *   // ...
 * });
 *
 *
 * @example
 * const { configureScope } = require('@sentry/node');
 * configureScope((scope: Scope) => {
 *   scope.setExtra({ battery: 0.7 });
 *   scope.setTags({ user_mode: 'admin' });
 *   scope.setUser({ id: '4711' });
 * });
 *
 * @example
 * const { addBreadcrumb } = require('@sentry/node');
 * addBreadcrumb({
 *   message: 'My Breadcrumb',
 *   // ...
 * });
 *
 * @example
 * const Sentry = require('@sentry/node');
 * Sentry.captureMessage('Hello, world!');
 * Sentry.captureException(new Error('Good bye'));
 * Sentry.captureEvent({
 *   message: 'Manual',
 *   stacktrace: [
 *     // ...
 *   ],
 * });
 *
 * @see NodeOptions for documentation on configuration options.
 */
function init(options) {
    core_1.initAndBind(client_1.NodeClient, options, [
        new integrations_1.OnUncaughtException(),
        new integrations_1.OnUnhandledRejection(),
        new integrations_1.Console(),
        new integrations_1.Http(),
    ]);
}
exports.init = init;
/** Returns the current NodeClient, if any. */
function getCurrentClient() {
    return shim_1.getCurrentClient();
}
exports.getCurrentClient = getCurrentClient;
//# sourceMappingURL=sdk.js.map