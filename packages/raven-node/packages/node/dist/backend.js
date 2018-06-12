"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = y[op[0] & 2 ? "return" : op[0] ? "throw" : "next"]) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [0, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var core_1 = require("@sentry/core");
var shim_1 = require("@sentry/shim");
var raven_1 = require("./raven");
/** Original Raven send function. */
var sendRavenEvent = raven_1.Raven.send.bind(raven_1.Raven);
/** The Sentry Node SDK Backend. */
var NodeBackend = /** @class */ (function () {
    /** Creates a new Node backend instance. */
    function NodeBackend(options) {
        if (options === void 0) { options = {}; }
        this.options = options;
    }
    /**
     * @inheritDoc
     */
    NodeBackend.prototype.install = function () {
        // We are only called by the client if the SDK is enabled and a valid DSN
        // has been configured. If no DSN is present, this indicates a programming
        // error.
        var dsn = this.options.dsn;
        if (!dsn) {
            throw new core_1.SentryError('Invariant exception: install() must not be called when disabled');
        }
        raven_1.Raven.config(dsn, this.options);
        // We need to leave it here for now, as we are skipping `install` call,
        // due to integrations migration
        // TODO: Remove it once we fully migrate our code
        var onFatalError = this.options.onFatalError;
        if (onFatalError) {
            raven_1.Raven.onFatalError = onFatalError;
        }
        raven_1.Raven.installed = true;
        // Hook into Raven's breadcrumb mechanism. This allows us to intercept both
        // breadcrumbs created internally by Raven and pass them to the Client
        // first, before actually capturing them.
        raven_1.Raven.captureBreadcrumb = function (breadcrumb) {
            shim_1.addBreadcrumb(breadcrumb);
        };
        // Hook into Raven's internal event sending mechanism. This allows us to
        // pass events to the client, before they will be sent back here for
        // actual submission.
        raven_1.Raven.send = function (event, callback) {
            if (callback && callback.__SENTRY_CAPTURE__) {
                callback(event);
            }
            else {
                shim_1.captureEvent(event, callback);
            }
        };
        return true;
    };
    /**
     * @inheritDoc
     */
    NodeBackend.prototype.eventFromException = function (exception) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve) {
                        resolve.__SENTRY_CAPTURE__ = true;
                        raven_1.Raven.captureException(exception, resolve);
                    })];
            });
        });
    };
    /**
     * @inheritDoc
     */
    NodeBackend.prototype.eventFromMessage = function (message) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve) {
                        resolve.__SENTRY_CAPTURE__ = true;
                        raven_1.Raven.captureMessage(message, resolve);
                    })];
            });
        });
    };
    /**
     * @inheritDoc
     */
    NodeBackend.prototype.sendEvent = function (event) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve) {
                        sendRavenEvent(event, function (error) {
                            // TODO: Check the response status code
                            resolve(error ? 500 : 200);
                        });
                    })];
            });
        });
    };
    /**
     * @inheritDoc
     */
    NodeBackend.prototype.storeBreadcrumb = function () {
        return true;
    };
    /**
     * @inheritDoc
     */
    NodeBackend.prototype.storeScope = function () {
        // Noop
    };
    /**
     * Set the transport module used for submitting events.
     *
     * This can be set to modules like "http" or "https" or any other object that
     * provides a `request` method with options.
     *
     * @param transport The transport to use for submitting events.
     */
    NodeBackend.prototype.setTransport = function (transport) {
        var dsn = this.options.dsn;
        if (!dsn) {
            return;
        }
        var dsnObject = new core_1.DSN(dsn);
        raven_1.Raven.transport =
            dsnObject.protocol === 'http'
                ? new raven_1.HTTPTransport({ transport: transport })
                : new raven_1.HTTPSTransport({ transport: transport });
    };
    return NodeBackend;
}());
exports.NodeBackend = NodeBackend;
//# sourceMappingURL=backend.js.map