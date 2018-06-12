"use strict";
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spread = (this && this.__spread) || function () {
    for (var ar = [], i = 0; i < arguments.length; i++) ar = ar.concat(__read(arguments[i]));
    return ar;
};
Object.defineProperty(exports, "__esModule", { value: true });
var shim_1 = require("@sentry/shim");
/**
 * Internal function to create a new SDK client instance. The client is
 * installed and then bound to the current scope.
 *
 * @param clientClass The client class to instanciate.
 * @param options Options to pass to the client.
 * @returns The installed and bound client instance.
 */
function initAndBind(clientClass, options, defaultIntegrations) {
    if (defaultIntegrations === void 0) { defaultIntegrations = []; }
    if (shim_1.getCurrentClient()) {
        return;
    }
    var client = new clientClass(options);
    client.install();
    var integrations = __spread(defaultIntegrations);
    if (Array.isArray(options.integrations)) {
        integrations = __spread(integrations, options.integrations);
    }
    else if (typeof options.integrations === 'function') {
        integrations = options.integrations(integrations);
    }
    // Just in case someone will return non-array from a `itegrations` callback
    if (Array.isArray(integrations)) {
        integrations.forEach(function (integration) {
            integration.install();
        });
    }
    shim_1.bindClient(client);
}
exports.initAndBind = initAndBind;
//# sourceMappingURL=sdk.js.map