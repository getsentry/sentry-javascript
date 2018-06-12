"use strict";
var __assign = (this && this.__assign) || Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
    }
    return t;
};
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
/** An object to call setter functions on to enhance the event */
var Scope = /** @class */ (function () {
    /**
     * Create a new empty internal scope. This will not be exposed to the user.
     */
    function Scope() {
        /**
         * Callback for client to receive scope changes.
         */
        this.scopeChanged = function () {
            // noop
        };
        /** Array of breadcrumbs. */
        this.breadcrumbs = [];
        /** User */
        this.user = {};
        /** Tags */
        this.tags = {};
        /** Extra */
        this.extra = {};
        this.notifying = false;
    }
    /**
     * Set internal on change listener.
     */
    Scope.prototype.setOnChange = function (callback) {
        this.scopeChanged = callback;
    };
    /**
     * This will be called on every set call.
     */
    Scope.prototype.notifyListeners = function () {
        var _this = this;
        if (!this.notifying) {
            this.notifying = true;
            setTimeout(function () {
                _this.scopeChanged(_this);
                _this.notifying = false;
            }, 0);
        }
    };
    /**
     * Updates user context information for future events.
     * @param user User context object to merge into current context.
     */
    Scope.prototype.setUser = function (user) {
        this.user = user;
        this.notifyListeners();
    };
    /**
     * Updates tags context information for future events.
     * @param tags Tags context object to merge into current context.
     */
    Scope.prototype.setTag = function (key, value) {
        this.tags = __assign({}, this.tags, (_a = {}, _a[key] = value, _a));
        this.notifyListeners();
        var _a;
    };
    /**
     * Updates extra context information for future events.
     * @param extra Extra context object to merge into current context.
     */
    Scope.prototype.setExtra = function (key, extra) {
        this.extra = __assign({}, this.extra, (_a = {}, _a[key] = extra, _a));
        this.notifyListeners();
        var _a;
    };
    /**
     * Sets the fingerprint on the scope to send with the events.
     * @param fingerprint
     */
    Scope.prototype.setFingerprint = function (fingerprint) {
        this.fingerprint = fingerprint;
        this.notifyListeners();
    };
    /**
     * Inherit values from the parent scope.
     * @param scope
     */
    Scope.prototype.setParentScope = function (scope) {
        Object.assign(this, scope);
    };
    /** Returns breadcrumbs. */
    Scope.prototype.getBreadcrumbs = function () {
        return this.breadcrumbs;
    };
    /** Returns tags. */
    Scope.prototype.getTags = function () {
        return this.tags;
    };
    /** Returns extra. */
    Scope.prototype.getExtra = function () {
        return this.extra;
    };
    /** Returns extra. */
    Scope.prototype.getUser = function () {
        return this.user;
    };
    /** Returns fingerprint. */
    Scope.prototype.getFingerprint = function () {
        return this.fingerprint;
    };
    /**
     * Sets the breadcrumbs in the scope
     * @param breadcrumbs
     * @param maxBreadcrumbs
     */
    Scope.prototype.addBreadcrumb = function (breadcrumb, maxBreadcrumbs) {
        this.breadcrumbs =
            maxBreadcrumbs !== undefined && maxBreadcrumbs >= 0
                ? __spread(this.breadcrumbs, [breadcrumb]).slice(-maxBreadcrumbs)
                : __spread(this.breadcrumbs, [breadcrumb]);
        this.notifyListeners();
    };
    /** Clears the current scope and resets its properties. */
    Scope.prototype.clear = function () {
        this.breadcrumbs = [];
        this.tags = {};
        this.extra = {};
        this.user = {};
        this.fingerprint = undefined;
        this.notifyListeners();
    };
    /**
     * Applies the current context and fingerprint to the event.
     * Note that breadcrumbs will be added by the client.
     * @param event
     * @param maxBreadcrumbs
     */
    Scope.prototype.applyToEvent = function (event, maxBreadcrumbs) {
        if (this.extra && Object.keys(this.extra).length) {
            event.extra = __assign({}, this.extra, event.extra);
        }
        if (this.tags && Object.keys(this.tags).length) {
            event.tags = __assign({}, this.tags, event.tags);
        }
        if (this.user && Object.keys(this.user).length) {
            event.user = __assign({}, this.user, event.user);
        }
        if (this.fingerprint && event.fingerprint === undefined) {
            event.fingerprint = this.fingerprint;
        }
        // We only want to set breadcrumbs in the event if there are none
        var hasNoBreadcrumbs = !event.breadcrumbs ||
            event.breadcrumbs.length === 0 ||
            (event.breadcrumbs.values && event.breadcrumbs.values.length === 0);
        if (hasNoBreadcrumbs && this.breadcrumbs.length > 0) {
            event.breadcrumbs =
                maxBreadcrumbs !== undefined && maxBreadcrumbs >= 0
                    ? this.breadcrumbs.slice(-maxBreadcrumbs)
                    : this.breadcrumbs;
        }
    };
    return Scope;
}());
exports.Scope = Scope;
//# sourceMappingURL=scope.js.map