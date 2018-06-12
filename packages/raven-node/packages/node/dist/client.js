"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var core_1 = require("@sentry/core");
var backend_1 = require("./backend");
var raven_1 = require("./raven");
/**
 * The Sentry Node SDK Client.
 *
 * @see NodeOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
var NodeClient = /** @class */ (function (_super) {
    __extends(NodeClient, _super);
    /**
     * Creates a new Node SDK instance.
     * @param options Configuration options for this SDK.
     */
    function NodeClient(options) {
        return _super.call(this, backend_1.NodeBackend, options) || this;
    }
    /**
     * @inheritDoc
     */
    NodeClient.prototype.getSdkInfo = function () {
        return {
            name: 'sentry-node',
            version: raven_1.Raven.version,
        };
    };
    return NodeClient;
}(core_1.BaseClient));
exports.NodeClient = NodeClient;
//# sourceMappingURL=client.js.map