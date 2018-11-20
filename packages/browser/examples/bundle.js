/*! @sentry/browser 4.3.2 (14964e20) | https://github.com/getsentry/sentry-javascript */
var Sentry = (function (exports) {
    'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */
    /* global Reflect, Promise */

    var extendStatics = function(d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };

    function __extends(d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    }

    var __assign = function() {
        __assign = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };

    function __awaiter(thisArg, _arguments, P, generator) {
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    function __generator(thisArg, body) {
        var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
        return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
        function verb(n) { return function (v) { return step([n, v]); }; }
        function step(op) {
            if (f) throw new TypeError("Generator is already executing.");
            while (_) try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
                if (y = 0, t) op = [op[0] & 2, t.value];
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
    }

    function __values(o) {
        var m = typeof Symbol === "function" && o[Symbol.iterator], i = 0;
        if (m) return m.call(o);
        return {
            next: function () {
                if (o && i >= o.length) o = void 0;
                return { value: o && o[i++], done: !o };
            }
        };
    }

    function __read(o, n) {
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
    }

    function __spread() {
        for (var ar = [], i = 0; i < arguments.length; i++)
            ar = ar.concat(__read(arguments[i]));
        return ar;
    }

    /** JSDoc */
    (function (Severity) {
        /** JSDoc */
        Severity["Fatal"] = "fatal";
        /** JSDoc */
        Severity["Error"] = "error";
        /** JSDoc */
        Severity["Warning"] = "warning";
        /** JSDoc */
        Severity["Log"] = "log";
        /** JSDoc */
        Severity["Info"] = "info";
        /** JSDoc */
        Severity["Debug"] = "debug";
        /** JSDoc */
        Severity["Critical"] = "critical";
    })(exports.Severity || (exports.Severity = {}));
    // tslint:disable:no-unnecessary-qualifier no-namespace
    (function (Severity) {
        /**
         * Converts a string-based level into a {@link Severity}.
         *
         * @param level string representation of Severity
         * @returns Severity
         */
        function fromString(level) {
            switch (level) {
                case 'debug':
                    return Severity.Debug;
                case 'info':
                    return Severity.Info;
                case 'warn':
                case 'warning':
                    return Severity.Warning;
                case 'error':
                    return Severity.Error;
                case 'fatal':
                    return Severity.Fatal;
                case 'critical':
                    return Severity.Critical;
                case 'log':
                default:
                    return Severity.Log;
            }
        }
        Severity.fromString = fromString;
    })(exports.Severity || (exports.Severity = {}));
    (function (Status) {
        /** The status could not be determined. */
        Status["Unknown"] = "unknown";
        /** The event was skipped due to configuration or callbacks. */
        Status["Skipped"] = "skipped";
        /** The event was sent to Sentry successfully. */
        Status["Success"] = "success";
        /** The client is currently rate limited and will try again later. */
        Status["RateLimit"] = "rate_limit";
        /** The event could not be processed. */
        Status["Invalid"] = "invalid";
        /** A server-side error ocurred during submission. */
        Status["Failed"] = "failed";
    })(exports.Status || (exports.Status = {}));
    // tslint:disable:no-unnecessary-qualifier no-namespace
    (function (Status) {
        /**
         * Converts a HTTP status code into a {@link Status}.
         *
         * @param code The HTTP response status code.
         * @returns The send status or {@link Status.Unknown}.
         */
        function fromHttpCode(code) {
            if (code >= 200 && code < 300) {
                return Status.Success;
            }
            if (code === 429) {
                return Status.RateLimit;
            }
            if (code >= 400 && code < 500) {
                return Status.Invalid;
            }
            if (code >= 500) {
                return Status.Failed;
            }
            return Status.Unknown;
        }
        Status.fromHttpCode = fromHttpCode;
    })(exports.Status || (exports.Status = {}));

    /**
     * Checks whether given value's type is one of a few Error or Error-like
     * {@link isError}.
     *
     * @param wat A value to be checked.
     * @returns A boolean representing the result.
     */
    function isError(wat) {
        switch (Object.prototype.toString.call(wat)) {
            case '[object Error]':
                return true;
            case '[object Exception]':
                return true;
            case '[object DOMException]':
                return true;
            default:
                return wat instanceof Error;
        }
    }
    /**
     * Checks whether given value's type is ErrorEvent
     * {@link isErrorEvent}.
     *
     * @param wat A value to be checked.
     * @returns A boolean representing the result.
     */
    function isErrorEvent(wat) {
        return Object.prototype.toString.call(wat) === '[object ErrorEvent]';
    }
    /**
     * Checks whether given value's type is DOMError
     * {@link isDOMError}.
     *
     * @param wat A value to be checked.
     * @returns A boolean representing the result.
     */
    function isDOMError(wat) {
        return Object.prototype.toString.call(wat) === '[object DOMError]';
    }
    /**
     * Checks whether given value's type is DOMException
     * {@link isDOMException}.
     *
     * @param wat A value to be checked.
     * @returns A boolean representing the result.
     */
    function isDOMException(wat) {
        return Object.prototype.toString.call(wat) === '[object DOMException]';
    }
    /**
     * Checks whether given value's type is an undefined
     * {@link isUndefined}.
     *
     * @param wat A value to be checked.
     * @returns A boolean representing the result.
     */
    function isUndefined(wat) {
        return wat === void 0;
    }
    /**
     * Checks whether given value's type is a function
     * {@link isFunction}.
     *
     * @param wat A value to be checked.
     * @returns A boolean representing the result.
     */
    function isFunction(wat) {
        return typeof wat === 'function';
    }
    /**
     * Checks whether given value's type is a string
     * {@link isString}.
     *
     * @param wat A value to be checked.
     * @returns A boolean representing the result.
     */
    function isString(wat) {
        return Object.prototype.toString.call(wat) === '[object String]';
    }
    /**
     * Checks whether given value's type is an object literal
     * {@link isPlainObject}.
     *
     * @param wat A value to be checked.
     * @returns A boolean representing the result.
     */
    function isPlainObject(wat) {
        return Object.prototype.toString.call(wat) === '[object Object]';
    }
    /**
     * Checks whether given value's type is an regexp
     * {@link isRegExp}.
     *
     * @param wat A value to be checked.
     * @returns A boolean representing the result.
     */
    function isRegExp(wat) {
        return Object.prototype.toString.call(wat) === '[object RegExp]';
    }
    /**
     * Checks whether given value's type is a NaN
     * {@link isNaN}.
     *
     * @param wat A value to be checked.
     * @returns A boolean representing the result.
     */
    function isNaN(wat) {
        return wat !== wat;
    }

    /**
     * Requires a module which is protected against bundler minification.
     *
     * @param request The module path to resolve
     */
    function dynamicRequire(mod, request) {
        return mod.require(request);
    }
    /**
     * Checks whether we're in the Node.js or Browser environment
     *
     * @returns Answer to given question
     */
    function isNodeEnv() {
        // tslint:disable:strict-type-predicates
        return Object.prototype.toString.call(typeof process !== 'undefined' ? process : 0) === '[object process]';
    }
    /**
     * Safely get global scope object
     *
     * @returns Global scope object
     */
    // tslint:disable:strict-type-predicates
    function getGlobalObject() {
        return isNodeEnv() ? global : typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : {};
    }
    /**
     * UUID4 generator
     *
     * @returns string Generated UUID4.
     */
    function uuid4() {
        var global = getGlobalObject();
        var crypto = global.crypto || global.msCrypto;
        if (!(crypto === void 0) && crypto.getRandomValues) {
            // Use window.crypto API if available
            var arr = new Uint16Array(8);
            crypto.getRandomValues(arr);
            // set 4 in byte 7
            // tslint:disable-next-line:no-bitwise
            arr[3] = (arr[3] & 0xfff) | 0x4000;
            // set 2 most significant bits of byte 9 to '10'
            // tslint:disable-next-line:no-bitwise
            arr[4] = (arr[4] & 0x3fff) | 0x8000;
            var pad = function (num) {
                var v = num.toString(16);
                while (v.length < 4) {
                    v = "0" + v;
                }
                return v;
            };
            return (pad(arr[0]) + pad(arr[1]) + pad(arr[2]) + pad(arr[3]) + pad(arr[4]) + pad(arr[5]) + pad(arr[6]) + pad(arr[7]));
        }
        else {
            // http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/2117523#2117523
            return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                // tslint:disable-next-line:no-bitwise
                var r = (Math.random() * 16) | 0;
                // tslint:disable-next-line:no-bitwise
                var v = c === 'x' ? r : (r & 0x3) | 0x8;
                return v.toString(16);
            });
        }
    }
    /**
     * Given a child DOM element, returns a query-selector statement describing that
     * and its ancestors
     * e.g. [HTMLElement] => body > div > input#foo.btn[name=baz]
     * @returns generated DOM path
     */
    function htmlTreeAsString(elem) {
        var currentElem = elem;
        var MAX_TRAVERSE_HEIGHT = 5;
        var MAX_OUTPUT_LEN = 80;
        var out = [];
        var height = 0;
        var len = 0;
        var separator = ' > ';
        var sepLength = separator.length;
        var nextStr;
        while (currentElem && height++ < MAX_TRAVERSE_HEIGHT) {
            nextStr = htmlElementAsString(currentElem);
            // bail out if
            // - nextStr is the 'html' element
            // - the length of the string that would be created exceeds MAX_OUTPUT_LEN
            //   (ignore this limit if we are on the first iteration)
            if (nextStr === 'html' || (height > 1 && len + out.length * sepLength + nextStr.length >= MAX_OUTPUT_LEN)) {
                break;
            }
            out.push(nextStr);
            len += nextStr.length;
            currentElem = currentElem.parentNode;
        }
        return out.reverse().join(separator);
    }
    /**
     * Returns a simple, query-selector representation of a DOM element
     * e.g. [HTMLElement] => input#foo.btn[name=baz]
     * @returns generated DOM path
     */
    function htmlElementAsString(elem) {
        var out = [];
        var className;
        var classes;
        var key;
        var attr;
        var i;
        if (!elem || !elem.tagName) {
            return '';
        }
        out.push(elem.tagName.toLowerCase());
        if (elem.id) {
            out.push("#" + elem.id);
        }
        className = elem.className;
        if (className && isString(className)) {
            classes = className.split(/\s+/);
            for (i = 0; i < classes.length; i++) {
                out.push("." + classes[i]);
            }
        }
        var attrWhitelist = ['type', 'name', 'title', 'alt'];
        for (i = 0; i < attrWhitelist.length; i++) {
            key = attrWhitelist[i];
            attr = elem.getAttribute(key);
            if (attr) {
                out.push("[" + key + "=\"" + attr + "\"]");
            }
        }
        return out.join('');
    }
    /**
     * Parses string form of URL into an object
     * // borrowed from https://tools.ietf.org/html/rfc3986#appendix-B
     * // intentionally using regex and not <a/> href parsing trick because React Native and other
     * // environments where DOM might not be available
     * @returns parsed URL object
     */
    function parseUrl(url) {
        if (!url) {
            return {};
        }
        var match = url.match(/^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/);
        if (!match) {
            return {};
        }
        // coerce to undefined values to empty string so we don't get 'undefined'
        var query = match[6] || '';
        var fragment = match[8] || '';
        return {
            host: match[4],
            path: match[5],
            protocol: match[2],
            relative: match[5] + query + fragment,
        };
    }
    /**
     * Extracts either message or type+value from an event that can be used for user-facing logs
     * @returns event's description
     */
    function getEventDescription(event) {
        if (event.message) {
            return event.message;
        }
        else if (event.exception && event.exception.values && event.exception.values[0]) {
            var exception = event.exception.values[0];
            if (exception.type && exception.value) {
                return exception.type + ": " + exception.value;
            }
            else {
                return exception.type || exception.value || event.event_id || '<unknown>';
            }
        }
        else {
            return event.event_id || '<unknown>';
        }
    }
    /** JSDoc */
    function consoleSandbox(callback) {
        var global = getGlobalObject();
        var levels = ['debug', 'info', 'warn', 'error', 'log'];
        if (!('console' in global)) {
            return callback();
        }
        var originalConsole = global.console;
        var wrappedLevels = {};
        // Restore all wrapped console methods
        levels.forEach(function (level) {
            if (level in global.console && originalConsole[level].__sentry__) {
                wrappedLevels[level] = originalConsole[level].__sentry_wrapped__;
                originalConsole[level] = originalConsole[level].__sentry_original__;
            }
        });
        // Perform callback manipulations
        var result = callback();
        // Revert restoration to wrapped state
        Object.keys(wrappedLevels).forEach(function (level) {
            originalConsole[level] = wrappedLevels[level];
        });
        return result;
    }

    /**
     * Transforms Error object into an object literal with all it's attributes
     * attached to it.
     *
     * Based on: https://github.com/ftlabs/js-abbreviate/blob/fa709e5f139e7770a71827b1893f22418097fbda/index.js#L95-L106
     *
     * @param error An Error containing all relevant information
     * @returns An object with all error properties
     */
    function objectifyError(error) {
        // These properties are implemented as magical getters and don't show up in `for-in` loop
        var err = {
            message: error.message,
            name: error.name,
            stack: error.stack,
        };
        for (var i in error) {
            if (Object.prototype.hasOwnProperty.call(error, i)) {
                err[i] = error[i];
            }
        }
        return err;
    }
    var NAN_VALUE = '[NaN]';
    var UNDEFINED_VALUE = '[undefined]';
    /**
     * Serializer function used as 2nd argument to JSON.serialize in `serialize()` util function.
     */
    function serializer() {
        var stack = [];
        var keys = [];
        var cycleReplacer = function (_, value) {
            if (stack[0] === value) {
                return '[Circular ~]';
            }
            return "[Circular ~." + keys.slice(0, stack.indexOf(value)).join('.') + "]";
        };
        return function (key, value) {
            var currentValue = value;
            // NaN and undefined are not JSON.parseable, but we want to preserve this information
            if (isNaN(value)) {
                currentValue = NAN_VALUE;
            }
            else if (isUndefined(value)) {
                currentValue = UNDEFINED_VALUE;
            }
            if (stack.length > 0) {
                var thisPos = stack.indexOf(this);
                if (thisPos !== -1) {
                    stack.splice(thisPos + 1);
                    keys.splice(thisPos, Infinity, key);
                }
                else {
                    stack.push(this);
                    keys.push(key);
                }
                if (stack.indexOf(currentValue) !== -1) {
                    currentValue = cycleReplacer.call(this, key, currentValue);
                }
            }
            else {
                stack.push(currentValue);
            }
            return currentValue instanceof Error ? objectifyError(currentValue) : currentValue;
        };
    }
    /**
     * Reviver function used as 2nd argument to JSON.parse in `deserialize()` util function.
     */
    function reviver(_key, value) {
        // NaN and undefined are not JSON.parseable, but we want to preserve this information
        if (value === NAN_VALUE) {
            return NaN;
        }
        if (value === UNDEFINED_VALUE) {
            return undefined;
        }
        return value;
    }
    /**
     * Serializes the given object into a string.
     * Like JSON.stringify, but doesn't throw on circular references.
     * Based on a `json-stringify-safe` package and modified to handle Errors serialization.
     *
     * The object must be serializable, i.e.:
     *  - Only primitive types are allowed (object, array, number, string, boolean)
     *  - Its depth should be considerably low for performance reasons
     *
     * @param object A JSON-serializable object.
     * @returns A string containing the serialized object.
     */
    function serialize(object) {
        return JSON.stringify(object, serializer());
    }
    /**
     * Deserializes an object from a string previously serialized with
     * {@link serialize}.
     *
     * @param str A serialized object.
     * @returns The deserialized object.
     */
    function deserialize(str) {
        return JSON.parse(str, reviver);
    }
    /**
     * Wrap a given object method with a higher-order function
     *
     * @param source An object that contains a method to be wrapped.
     * @param name A name of method to be wrapped.
     * @param replacement A function that should be used to wrap a given method.
     * @returns void
     */
    function fill(source, name, replacement) {
        if (!(name in source) || source[name].__sentry__) {
            return;
        }
        var original = source[name];
        var wrapped = replacement(original);
        wrapped.__sentry__ = true;
        wrapped.__sentry_original__ = original;
        wrapped.__sentry_wrapped__ = wrapped;
        source[name] = wrapped;
    }
    /**
     * Encodes given object into url-friendly format
     *
     * @param object An object that contains serializable values
     * @returns string Encoded
     */
    function urlEncode(object) {
        return Object.keys(object)
            .map(
        // tslint:disable-next-line:no-unsafe-any
        function (key) { return encodeURIComponent(key) + "=" + encodeURIComponent(object[key]); })
            .join('&');
    }
    // Default Node.js REPL depth
    var MAX_SERIALIZE_EXCEPTION_DEPTH = 3;
    // 100kB, as 200kB is max payload size, so half sounds reasonable
    var MAX_SERIALIZE_EXCEPTION_SIZE = 100 * 1024;
    var MAX_SERIALIZE_KEYS_LENGTH = 40;
    /** JSDoc */
    function utf8Length(value) {
        // tslint:disable-next-line:no-bitwise
        return ~-encodeURI(value).split(/%..|./).length;
    }
    /** JSDoc */
    function jsonSize(value) {
        return utf8Length(JSON.stringify(value));
    }
    /** JSDoc */
    function serializeValue(value) {
        var maxLength = 40;
        if (typeof value === 'string') {
            return value.length <= maxLength ? value : value.substr(0, maxLength - 1) + "\u2026";
        }
        else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'undefined') {
            return value;
        }
        else if (isNaN(value)) {
            // NaN and undefined are not JSON.parseable, but we want to preserve this information
            return '[NaN]';
        }
        else if (isUndefined(value)) {
            return '[undefined]';
        }
        var type = Object.prototype.toString.call(value);
        // Node.js REPL notation
        if (type === '[object Object]') {
            return '[Object]';
        }
        if (type === '[object Array]') {
            return '[Array]';
        }
        if (type === '[object Function]') {
            var name_1 = value.name;
            return name_1 ? "[Function: " + name_1 + "]" : '[Function]';
        }
        return value;
    }
    /** JSDoc */
    function serializeObject(value, depth) {
        if (depth === 0) {
            return serializeValue(value);
        }
        if (isPlainObject(value)) {
            var serialized_1 = {};
            var val_1 = value;
            Object.keys(val_1).forEach(function (key) {
                serialized_1[key] = serializeObject(val_1[key], depth - 1);
            });
            return serialized_1;
        }
        else if (Array.isArray(value)) {
            var val = value;
            return val.map(function (v) { return serializeObject(v, depth - 1); });
        }
        return serializeValue(value);
    }
    /** JSDoc */
    function limitObjectDepthToSize(object, depth, maxSize) {
        if (depth === void 0) { depth = MAX_SERIALIZE_EXCEPTION_DEPTH; }
        if (maxSize === void 0) { maxSize = MAX_SERIALIZE_EXCEPTION_SIZE; }
        var serialized = serializeObject(object, depth);
        if (jsonSize(serialize(serialized)) > maxSize) {
            return limitObjectDepthToSize(object, depth - 1);
        }
        return serialized;
    }
    /** JSDoc */
    function serializeKeysToEventMessage(keys, maxLength) {
        if (maxLength === void 0) { maxLength = MAX_SERIALIZE_KEYS_LENGTH; }
        if (!keys.length) {
            return '[object has no keys]';
        }
        if (keys[0].length >= maxLength) {
            return keys[0];
        }
        for (var includedKeys = keys.length; includedKeys > 0; includedKeys--) {
            var serialized = keys.slice(0, includedKeys).join(', ');
            if (serialized.length > maxLength) {
                continue;
            }
            if (includedKeys === keys.length) {
                return serialized;
            }
            return serialized + "\u2026";
        }
        return '';
    }
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#Polyfill
    /** JSDoc */
    function assign(target) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        var e_1, _a;
        if (target === null || target === undefined) {
            throw new TypeError('Cannot convert undefined or null to object');
        }
        var to = Object(target);
        try {
            for (var args_1 = __values(args), args_1_1 = args_1.next(); !args_1_1.done; args_1_1 = args_1.next()) {
                var source = args_1_1.value;
                if (source !== null) {
                    for (var nextKey in source) {
                        if (Object.prototype.hasOwnProperty.call(source, nextKey)) {
                            to[nextKey] = source[nextKey];
                        }
                    }
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (args_1_1 && !args_1_1.done && (_a = args_1.return)) _a.call(args_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return to;
    }

    /**
     * Holds additional event information. {@link Scope.applyToEvent} will be
     * called by the client before an event will be sent.
     */
    var Scope = /** @class */ (function () {
        function Scope() {
            /** Flag if notifiying is happening. */
            this.notifyingListeners = false;
            /** Callback for client to receive scope changes. */
            this.scopeListeners = [];
            /** Callback list that will be called after {@link applyToEvent}. */
            this.eventProcessors = [];
            /** Array of breadcrumbs. */
            this.breadcrumbs = [];
            /** User */
            this.user = {};
            /** Tags */
            this.tags = {};
            /** Extra */
            this.extra = {};
        }
        /** Add internal on change listener. */
        Scope.prototype.addScopeListener = function (callback) {
            this.scopeListeners.push(callback);
        };
        /** Add new event processor that will be called after {@link applyToEvent}. */
        Scope.prototype.addEventProcessor = function (callback) {
            this.eventProcessors.push(callback);
            return this;
        };
        /**
         * This will be called on every set call.
         */
        Scope.prototype.notifyScopeListeners = function () {
            var _this = this;
            if (!this.notifyingListeners) {
                this.notifyingListeners = true;
                setTimeout(function () {
                    _this.scopeListeners.forEach(function (callback) {
                        callback(_this);
                    });
                    _this.notifyingListeners = false;
                }, 0);
            }
        };
        /**
         * This will be called after {@link applyToEvent} is finished.
         */
        Scope.prototype.notifyEventProcessors = function (event, hint) {
            return __awaiter(this, void 0, void 0, function () {
                var e_1, _a, processedEvent, _b, _c, processor, e_2, e_1_1;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            processedEvent = event;
                            _d.label = 1;
                        case 1:
                            _d.trys.push([1, 8, 9, 10]);
                            _b = __values(__spread(getGlobalEventProcessors(), this.eventProcessors)), _c = _b.next();
                            _d.label = 2;
                        case 2:
                            if (!!_c.done) return [3 /*break*/, 7];
                            processor = _c.value;
                            _d.label = 3;
                        case 3:
                            _d.trys.push([3, 5, , 6]);
                            return [4 /*yield*/, processor(__assign({}, processedEvent), hint)];
                        case 4:
                            processedEvent = _d.sent();
                            if (processedEvent === null) {
                                return [2 /*return*/, null];
                            }
                            return [3 /*break*/, 6];
                        case 5:
                            e_2 = _d.sent();
                            return [3 /*break*/, 6];
                        case 6:
                            _c = _b.next();
                            return [3 /*break*/, 2];
                        case 7: return [3 /*break*/, 10];
                        case 8:
                            e_1_1 = _d.sent();
                            e_1 = { error: e_1_1 };
                            return [3 /*break*/, 10];
                        case 9:
                            try {
                                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                            }
                            finally { if (e_1) throw e_1.error; }
                            return [7 /*endfinally*/];
                        case 10: return [2 /*return*/, processedEvent];
                    }
                });
            });
        };
        /**
         * Updates user context information for future events.
         * @param user User context object to merge into current context.
         */
        Scope.prototype.setUser = function (user) {
            this.user = user;
            this.notifyScopeListeners();
            return this;
        };
        /**
         * Updates tags context information for future events.
         * @param tags Tags context object to merge into current context.
         */
        Scope.prototype.setTag = function (key, value) {
            var _a;
            this.tags = __assign({}, this.tags, (_a = {}, _a[key] = value, _a));
            this.notifyScopeListeners();
            return this;
        };
        /**
         * Updates extra context information for future events.
         * @param extra context object to merge into current context.
         */
        Scope.prototype.setExtra = function (key, extra) {
            var _a;
            this.extra = __assign({}, this.extra, (_a = {}, _a[key] = extra, _a));
            this.notifyScopeListeners();
            return this;
        };
        /**
         * Sets the fingerprint on the scope to send with the events.
         * @param fingerprint string[] to group events in Sentry.
         */
        Scope.prototype.setFingerprint = function (fingerprint) {
            this.fingerprint = fingerprint;
            this.notifyScopeListeners();
            return this;
        };
        /**
         * Sets the level on the scope for future events.
         * @param level string {@link Severity}
         */
        Scope.prototype.setLevel = function (level) {
            this.level = level;
            this.notifyScopeListeners();
            return this;
        };
        /**
         * Inherit values from the parent scope.
         * @param scope to clone.
         */
        Scope.clone = function (scope) {
            var newScope = new Scope();
            assign(newScope, scope, {
                scopeListeners: [],
            });
            if (scope) {
                newScope.extra = assign(scope.extra);
                newScope.tags = assign(scope.tags);
                newScope.breadcrumbs = __spread(scope.breadcrumbs);
                newScope.eventProcessors = __spread(scope.eventProcessors);
            }
            return newScope;
        };
        /** Clears the current scope and resets its properties. */
        Scope.prototype.clear = function () {
            this.breadcrumbs = [];
            this.tags = {};
            this.extra = {};
            this.user = {};
            this.level = undefined;
            this.fingerprint = undefined;
            this.notifyScopeListeners();
        };
        /**
         * Sets the breadcrumbs in the scope
         * @param breadcrumbs Breadcrumb
         * @param maxBreadcrumbs number of max breadcrumbs to merged into event.
         */
        Scope.prototype.addBreadcrumb = function (breadcrumb, maxBreadcrumbs) {
            this.breadcrumbs =
                maxBreadcrumbs !== undefined && maxBreadcrumbs >= 0
                    ? __spread(this.breadcrumbs, [breadcrumb]).slice(-maxBreadcrumbs)
                    : __spread(this.breadcrumbs, [breadcrumb]);
            this.notifyScopeListeners();
        };
        /**
         * Applies fingerprint from the scope to the event if there's one,
         * uses message if there's one instead or get rid of empty fingerprint
         */
        Scope.prototype.applyFingerprint = function (event) {
            // Make sure it's an array first and we actually have something in place
            event.fingerprint = event.fingerprint
                ? Array.isArray(event.fingerprint)
                    ? event.fingerprint
                    : [event.fingerprint]
                : [];
            // If we have something on the scope, then merge it with event
            if (this.fingerprint) {
                event.fingerprint = event.fingerprint.concat(this.fingerprint);
            }
            else if (event.message) {
                // If not, but we have message, use it instead
                event.fingerprint = event.fingerprint.concat(event.message);
            }
            // If we have no data at all, remove empty array default
            if (event.fingerprint && !event.fingerprint.length) {
                delete event.fingerprint;
            }
        };
        /**
         * Applies the current context and fingerprint to the event.
         * Note that breadcrumbs will be added by the client.
         * Also if the event has already breadcrumbs on it, we do not merge them.
         * @param event SentryEvent
         * @param hint May contain additional informartion about the original exception.
         * @param maxBreadcrumbs number of max breadcrumbs to merged into event.
         */
        Scope.prototype.applyToEvent = function (event, hint, maxBreadcrumbs) {
            return __awaiter(this, void 0, void 0, function () {
                var hasNoBreadcrumbs;
                return __generator(this, function (_a) {
                    if (this.extra && Object.keys(this.extra).length) {
                        event.extra = __assign({}, this.extra, event.extra);
                    }
                    if (this.tags && Object.keys(this.tags).length) {
                        event.tags = __assign({}, this.tags, event.tags);
                    }
                    if (this.user && Object.keys(this.user).length) {
                        event.user = __assign({}, this.user, event.user);
                    }
                    if (this.level) {
                        event.level = this.level;
                    }
                    this.applyFingerprint(event);
                    hasNoBreadcrumbs = !event.breadcrumbs || event.breadcrumbs.length === 0;
                    if (hasNoBreadcrumbs && this.breadcrumbs.length > 0) {
                        event.breadcrumbs =
                            maxBreadcrumbs !== undefined && maxBreadcrumbs >= 0
                                ? this.breadcrumbs.slice(-maxBreadcrumbs)
                                : this.breadcrumbs;
                    }
                    return [2 /*return*/, this.notifyEventProcessors(event, hint)];
                });
            });
        };
        return Scope;
    }());
    /**
     * Retruns the global event processors.
     */
    function getGlobalEventProcessors() {
        var global = getGlobalObject();
        global.__SENTRY__ = global.__SENTRY__ || {};
        global.__SENTRY__.globalEventProcessors = global.__SENTRY__.globalEventProcessors || [];
        return global.__SENTRY__.globalEventProcessors;
    }
    /**
     * Add a EventProcessor to be kept globally.
     * @param callback EventProcessor to add
     */
    function addGlobalEventProcessor(callback) {
        getGlobalEventProcessors().push(callback);
    }

    // TODO: Implement different loggers for different environments
    var global$1 = getGlobalObject();
    /** JSDoc */
    var Logger = /** @class */ (function () {
        /** JSDoc */
        function Logger() {
            this.enabled = false;
        }
        /** JSDoc */
        Logger.prototype.disable = function () {
            this.enabled = false;
        };
        /** JSDoc */
        Logger.prototype.enable = function () {
            this.enabled = true;
        };
        /** JSDoc */
        Logger.prototype.log = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            if (!this.enabled) {
                return;
            }
            consoleSandbox(function () {
                global$1.console.log("Sentry Logger [Log]: " + args.join(' ')); // tslint:disable-line:no-console
            });
        };
        /** JSDoc */
        Logger.prototype.warn = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            if (!this.enabled) {
                return;
            }
            consoleSandbox(function () {
                global$1.console.warn("Sentry Logger [Warn]: " + args.join(' ')); // tslint:disable-line:no-console
            });
        };
        /** JSDoc */
        Logger.prototype.error = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            if (!this.enabled) {
                return;
            }
            consoleSandbox(function () {
                global$1.console.error("Sentry Logger [Error]: " + args.join(' ')); // tslint:disable-line:no-console
            });
        };
        return Logger;
    }());
    var logger = new Logger();

    /**
     * API compatibility version of this hub.
     *
     * WARNING: This number should only be incresed when the global interface
     * changes a and new methods are introduced.
     */
    var API_VERSION = 3;
    /**
     * Internal class used to make sure we always have the latest internal functions
     * working in case we have a version conflict.
     */
    var Hub = /** @class */ (function () {
        /**
         * Creates a new instance of the hub, will push one {@link Layer} into the
         * internal stack on creation.
         *
         * @param client bound to the hub.
         * @param scope bound to the hub.
         * @param version number, higher number means higher priority.
         */
        function Hub(client, scope, version) {
            if (scope === void 0) { scope = new Scope(); }
            if (version === void 0) { version = API_VERSION; }
            this.version = version;
            /** Is a {@link Layer}[] containing the client and scope */
            this.stack = [];
            this.stack.push({ client: client, scope: scope });
        }
        /**
         * Internal helper function to call a method on the top client if it exists.
         *
         * @param method The method to call on the client/client.
         * @param args Arguments to pass to the client/frontend.
         */
        Hub.prototype.invokeClient = function (method) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            var _a;
            var top = this.getStackTop();
            if (top && top.client && top.client[method]) {
                (_a = top.client)[method].apply(_a, __spread(args, [top.scope]));
            }
        };
        /**
         * Internal helper function to call an async method on the top client if it
         * exists.
         *
         * @param method The method to call on the client/client.
         * @param args Arguments to pass to the client/frontend.
         */
        Hub.prototype.invokeClientAsync = function (method) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            var _a;
            var top = this.getStackTop();
            if (top && top.client && top.client[method]) {
                (_a = top.client)[method].apply(_a, __spread(args, [top.scope])).catch(function (err) {
                    logger.error(err);
                });
            }
        };
        /**
         * Checks if this hub's version is older than the given version.
         *
         * @param version A version number to compare to.
         * @return True if the given version is newer; otherwise false.
         */
        Hub.prototype.isOlderThan = function (version) {
            return this.version < version;
        };
        /**
         * This binds the given client to the current scope.
         * @param client An SDK client (client) instance.
         */
        Hub.prototype.bindClient = function (client) {
            var top = this.getStackTop();
            top.client = client;
            if (top && top.scope && client) {
                top.scope.addScopeListener(function (s) {
                    if (client.getBackend) {
                        try {
                            client.getBackend().storeScope(s);
                        }
                        catch (_a) {
                            // Do nothing
                        }
                    }
                });
            }
        };
        /**
         * Create a new scope to store context information.
         *
         * The scope will be layered on top of the current one. It is isolated, i.e. all
         * breadcrumbs and context information added to this scope will be removed once
         * the scope ends. Be sure to always remove this scope with {@link this.popScope}
         * when the operation finishes or throws.
         *
         * @returns Scope, the new cloned scope
         */
        Hub.prototype.pushScope = function () {
            // We want to clone the content of prev scope
            var stack = this.getStack();
            var parentScope = stack.length > 0 ? stack[stack.length - 1].scope : undefined;
            var scope = Scope.clone(parentScope);
            this.getStack().push({
                client: this.getClient(),
                scope: scope,
            });
            return scope;
        };
        /**
         * Removes a previously pushed scope from the stack.
         *
         * This restores the state before the scope was pushed. All breadcrumbs and
         * context information added since the last call to {@link this.pushScope} are
         * discarded.
         */
        Hub.prototype.popScope = function () {
            return this.getStack().pop() !== undefined;
        };
        /**
         * Creates a new scope with and executes the given operation within.
         * The scope is automatically removed once the operation
         * finishes or throws.
         *
         * This is essentially a convenience function for:
         *
         *     pushScope();
         *     callback();
         *     popScope();
         *
         * @param callback that will be enclosed into push/popScope.
         */
        Hub.prototype.withScope = function (callback) {
            var scope = this.pushScope();
            try {
                callback(scope);
            }
            finally {
                this.popScope();
            }
        };
        /** Returns the client of the top stack. */
        Hub.prototype.getClient = function () {
            return this.getStackTop().client;
        };
        /** Returns the scope of the top stack. */
        Hub.prototype.getScope = function () {
            return this.getStackTop().scope;
        };
        /** Returns the scope stack for domains or the process. */
        Hub.prototype.getStack = function () {
            return this.stack;
        };
        /** Returns the topmost scope layer in the order domain > local > process. */
        Hub.prototype.getStackTop = function () {
            return this.stack[this.stack.length - 1];
        };
        /**
         * Captures an exception event and sends it to Sentry.
         *
         * @param exception An exception-like object.
         * @param hint May contain additional information about the original exception.
         * @returns The generated eventId.
         */
        Hub.prototype.captureException = function (exception, hint) {
            var eventId = (this._lastEventId = uuid4());
            this.invokeClientAsync('captureException', exception, __assign({}, hint, { event_id: eventId }));
            return eventId;
        };
        /**
         * Captures a message event and sends it to Sentry.
         *
         * @param message The message to send to Sentry.
         * @param level Define the level of the message.
         * @param hint May contain additional information about the original exception.
         * @returns The generated eventId.
         */
        Hub.prototype.captureMessage = function (message, level, hint) {
            var eventId = (this._lastEventId = uuid4());
            this.invokeClientAsync('captureMessage', message, level, __assign({}, hint, { event_id: eventId }));
            return eventId;
        };
        /**
         * Captures a manually created event and sends it to Sentry.
         *
         * @param event The event to send to Sentry.
         * @param hint May contain additional information about the original exception.
         */
        Hub.prototype.captureEvent = function (event, hint) {
            var eventId = (this._lastEventId = uuid4());
            this.invokeClientAsync('captureEvent', event, __assign({}, hint, { event_id: eventId }));
            return eventId;
        };
        /**
         * This is the getter for lastEventId.
         *
         * @returns The last event id of a captured event.
         */
        Hub.prototype.lastEventId = function () {
            return this._lastEventId;
        };
        /**
         * Records a new breadcrumb which will be attached to future events.
         *
         * Breadcrumbs will be added to subsequent events to provide more context on
         * user's actions prior to an error or crash.
         *
         * @param breadcrumb The breadcrumb to record.
         * @param hint May contain additional information about the original breadcrumb.
         */
        Hub.prototype.addBreadcrumb = function (breadcrumb, hint) {
            this.invokeClient('addBreadcrumb', breadcrumb, __assign({}, hint));
        };
        /**
         * Callback to set context information onto the scope.
         *
         * @param callback Callback function that receives Scope.
         */
        Hub.prototype.configureScope = function (callback) {
            var top = this.getStackTop();
            if (top.scope && top.client) {
                // TODO: freeze flag
                callback(top.scope);
            }
        };
        /**
         * For the duraction of the callback, this hub will be set as the global current Hub.
         * This function is useful if you want to run your own client and hook into an already initialized one
         * e.g.: Reporting issues to your own sentry when running in your component while still using the users configuration.
         */
        Hub.prototype.run = function (callback) {
            var oldHub = makeMain(this);
            try {
                callback(this);
            }
            finally {
                makeMain(oldHub);
            }
        };
        /** Returns the integration if installed on the current client. */
        Hub.prototype.getIntegration = function (integration) {
            try {
                return this.getClient().getIntegration(integration);
            }
            catch (_oO) {
                logger.warn("Cannot retrieve integration " + integration.id + " from the current Hub");
                return null;
            }
        };
        return Hub;
    }());
    /** Returns the global shim registry. */
    function getMainCarrier() {
        var carrier = getGlobalObject();
        carrier.__SENTRY__ = carrier.__SENTRY__ || {
            hub: undefined,
        };
        return carrier;
    }
    /**
     * Replaces the current main hub with the passed one on the global object
     *
     * @returns The old replaced hub
     */
    function makeMain(hub) {
        var registry = getMainCarrier();
        var oldHub = getHubFromCarrier(registry);
        setHubOnCarrier(registry, hub);
        return oldHub;
    }
    /**
     * Returns the default hub instance.
     *
     * If a hub is already registered in the global carrier but this module
     * contains a more recent version, it replaces the registered version.
     * Otherwise, the currently registered hub will be returned.
     */
    function getCurrentHub() {
        // Get main carrier (global for every environment)
        var registry = getMainCarrier();
        // If there's no hub, or its an old API, assign a new one
        if (!hasHubOnCarrier(registry) || getHubFromCarrier(registry).isOlderThan(API_VERSION)) {
            setHubOnCarrier(registry, new Hub());
        }
        // Prefer domains over global if they are there
        try {
            // We need to use `dynamicRequire` because `require` on it's own will be optimized by webpack.
            // We do not want this to happen, we need to try to `require` the domain node module and fail if we are in browser
            // for example so we do not have to shim it and use `getCurrentHub` universally.
            var domain = dynamicRequire(module, 'domain');
            var activeDomain = domain.active;
            // If there no active domain, just return global hub
            if (!activeDomain) {
                return getHubFromCarrier(registry);
            }
            // If there's no hub on current domain, or its an old API, assign a new one
            if (!hasHubOnCarrier(activeDomain) || getHubFromCarrier(activeDomain).isOlderThan(API_VERSION)) {
                var registryHubTopStack = getHubFromCarrier(registry).getStackTop();
                setHubOnCarrier(activeDomain, new Hub(registryHubTopStack.client, Scope.clone(registryHubTopStack.scope)));
            }
            // Return hub that lives on a domain
            return getHubFromCarrier(activeDomain);
        }
        catch (_Oo) {
            // Return hub that lives on a global object
            return getHubFromCarrier(registry);
        }
    }
    /**
     * This will tell whether a carrier has a hub on it or not
     * @param carrier object
     */
    function hasHubOnCarrier(carrier) {
        if (carrier && carrier.__SENTRY__ && carrier.__SENTRY__.hub) {
            return true;
        }
        else {
            return false;
        }
    }
    /**
     * This will create a new {@link Hub} and add to the passed object on
     * __SENTRY__.hub.
     * @param carrier object
     */
    function getHubFromCarrier(carrier) {
        if (carrier && carrier.__SENTRY__ && carrier.__SENTRY__.hub) {
            return carrier.__SENTRY__.hub;
        }
        else {
            carrier.__SENTRY__ = {};
            carrier.__SENTRY__.hub = new Hub();
            return carrier.__SENTRY__.hub;
        }
    }
    /**
     * This will set passed {@link Hub} on the passed object's __SENTRY__.hub attribute
     * @param carrier object
     * @param hub Hub
     */
    function setHubOnCarrier(carrier, hub) {
        if (!carrier) {
            return false;
        }
        carrier.__SENTRY__ = carrier.__SENTRY__ || {};
        carrier.__SENTRY__.hub = hub;
        return true;
    }

    /**
     * This calls a function on the current hub.
     * @param method function to call on hub.
     * @param args to pass to function.
     */
    function callOnHub(method) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        var hub = getCurrentHub();
        if (hub && hub[method]) {
            // tslint:disable-next-line:no-unsafe-any
            return hub[method].apply(hub, __spread(args));
        }
        throw new Error("No hub defined or " + method + " was not found on the hub, please open a bug report.");
    }
    /**
     * Captures an exception event and sends it to Sentry.
     *
     * @param exception An exception-like object.
     * @returns The generated eventId.
     */
    function captureException(exception) {
        var syntheticException;
        try {
            throw new Error('Sentry syntheticException');
        }
        catch (exception) {
            syntheticException = exception;
        }
        return callOnHub('captureException', exception, {
            originalException: exception,
            syntheticException: syntheticException,
        });
    }
    /**
     * Captures a message event and sends it to Sentry.
     *
     * @param message The message to send to Sentry.
     * @param level Define the level of the message.
     * @returns The generated eventId.
     */
    function captureMessage(message, level) {
        var syntheticException;
        try {
            throw new Error(message);
        }
        catch (exception) {
            syntheticException = exception;
        }
        return callOnHub('captureMessage', message, level, {
            originalException: message,
            syntheticException: syntheticException,
        });
    }
    /**
     * Captures a manually created event and sends it to Sentry.
     *
     * @param event The event to send to Sentry.
     * @returns The generated eventId.
     */
    function captureEvent(event) {
        return callOnHub('captureEvent', event);
    }
    /**
     * Records a new breadcrumb which will be attached to future events.
     *
     * Breadcrumbs will be added to subsequent events to provide more context on
     * user's actions prior to an error or crash.
     *
     * @param breadcrumb The breadcrumb to record.
     */
    function addBreadcrumb(breadcrumb) {
        callOnHub('addBreadcrumb', breadcrumb);
    }
    /**
     * Callback to set context information onto the scope.
     * @param callback Callback function that receives Scope.
     */
    function configureScope(callback) {
        callOnHub('configureScope', callback);
    }
    /**
     * Creates a new scope with and executes the given operation within.
     * The scope is automatically removed once the operation
     * finishes or throws.
     *
     * This is essentially a convenience function for:
     *
     *     pushScope();
     *     callback();
     *     popScope();
     *
     * @param callback that will be enclosed into push/popScope.
     */
    function withScope(callback) {
        callOnHub('withScope', callback);
    }

    /** An error emitted by Sentry SDKs and related utilities. */
    var SentryError = /** @class */ (function (_super) {
        __extends(SentryError, _super);
        function SentryError(message) {
            var _newTarget = this.constructor;
            var _this = _super.call(this, message) || this;
            _this.message = message;
            // tslint:disable:no-unsafe-any
            _this.name = _newTarget.prototype.constructor.name;
            Object.setPrototypeOf(_this, _newTarget.prototype);
            return _this;
        }
        return SentryError;
    }(Error));

    /** Regular expression used to parse a Dsn. */
    var DSN_REGEX = /^(?:(\w+):)\/\/(?:(\w+)(?::(\w+))?@)([\w\.-]+)(?::(\d+))?\/(.+)/;
    /** The Sentry Dsn, identifying a Sentry instance and project. */
    var Dsn = /** @class */ (function () {
        /** Creates a new Dsn component */
        function Dsn(from) {
            if (typeof from === 'string') {
                this.fromString(from);
            }
            else {
                this.fromComponents(from);
            }
            this.validate();
        }
        /**
         * Renders the string representation of this Dsn.
         *
         * By default, this will render the public representation without the password
         * component. To get the deprecated private representation, set `withPassword`
         * to true.
         *
         * @param withPassword When set to true, the password will be included.
         */
        Dsn.prototype.toString = function (withPassword) {
            if (withPassword === void 0) { withPassword = false; }
            // tslint:disable-next-line:no-this-assignment
            var _a = this, host = _a.host, path = _a.path, pass = _a.pass, port = _a.port, projectId = _a.projectId, protocol = _a.protocol, user = _a.user;
            return (protocol + "://" + user + (withPassword && pass ? ":" + pass : '') +
                ("@" + host + (port ? ":" + port : '') + "/" + (path ? path + "/" : path) + projectId));
        };
        /** Parses a string into this Dsn. */
        Dsn.prototype.fromString = function (str) {
            var match = DSN_REGEX.exec(str);
            if (!match) {
                throw new SentryError('Invalid Dsn');
            }
            var _a = __read(match.slice(1), 6), protocol = _a[0], user = _a[1], _b = _a[2], pass = _b === void 0 ? '' : _b, host = _a[3], _c = _a[4], port = _c === void 0 ? '' : _c, lastPath = _a[5];
            var path = '';
            var projectId = lastPath;
            var split = projectId.split('/');
            if (split.length > 1) {
                path = split.slice(0, -1).join('/');
                projectId = split.pop();
            }
            assign(this, { host: host, pass: pass, path: path, projectId: projectId, port: port, protocol: protocol, user: user });
        };
        /** Maps Dsn components into this instance. */
        Dsn.prototype.fromComponents = function (components) {
            this.protocol = components.protocol;
            this.user = components.user;
            this.pass = components.pass || '';
            this.host = components.host;
            this.port = components.port || '';
            this.path = components.path || '';
            this.projectId = components.projectId;
        };
        /** Validates this Dsn and throws on error. */
        Dsn.prototype.validate = function () {
            var e_1, _a;
            try {
                for (var _b = __values(['protocol', 'user', 'host', 'projectId']), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var component = _c.value;
                    if (!this[component]) {
                        throw new SentryError("Invalid Dsn: Missing " + component);
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
            if (this.protocol !== 'http' && this.protocol !== 'https') {
                throw new SentryError("Invalid Dsn: Unsupported protocol \"" + this.protocol + "\"");
            }
            if (this.port && isNaN(parseInt(this.port, 10))) {
                throw new SentryError("Invalid Dsn: Invalid port number \"" + this.port + "\"");
            }
        };
        return Dsn;
    }());

    var SENTRY_API_VERSION = '7';
    /** Helper class to provide urls to different Sentry endpoints. */
    var API = /** @class */ (function () {
        /** Create a new instance of API */
        function API(dsn) {
            this.dsn = dsn;
            this.dsnObject = new Dsn(dsn);
        }
        /** Returns the Dsn object. */
        API.prototype.getDsn = function () {
            return this.dsnObject;
        };
        /** Returns a string with auth headers in the url to the store endpoint. */
        API.prototype.getStoreEndpoint = function () {
            return "" + this.getBaseUrl() + this.getStoreEndpointPath();
        };
        /** Returns the store endpoint with auth added in url encoded. */
        API.prototype.getStoreEndpointWithUrlEncodedAuth = function () {
            var dsn = this.dsnObject;
            var auth = {
                sentry_key: dsn.user,
                sentry_version: SENTRY_API_VERSION,
            };
            // Auth is intentionally sent as part of query string (NOT as custom HTTP header)
            // to avoid preflight CORS requests
            return this.getStoreEndpoint() + "?" + urlEncode(auth);
        };
        /** Returns the base path of the url including the port. */
        API.prototype.getBaseUrl = function () {
            var dsn = this.dsnObject;
            var protocol = dsn.protocol ? dsn.protocol + ":" : '';
            var port = dsn.port ? ":" + dsn.port : '';
            return protocol + "//" + dsn.host + port;
        };
        /** Returns only the path component for the store endpoint. */
        API.prototype.getStoreEndpointPath = function () {
            var dsn = this.dsnObject;
            return (dsn.path ? "/" + dsn.path : '') + "/api/" + dsn.projectId + "/store/";
        };
        /** Returns an object that can be used in request headers. */
        API.prototype.getRequestHeaders = function (clientName, clientVersion) {
            var dsn = this.dsnObject;
            var header = ["Sentry sentry_version=" + SENTRY_API_VERSION];
            header.push("sentry_timestamp=" + new Date().getTime());
            header.push("sentry_client=" + clientName + "/" + clientVersion);
            header.push("sentry_key=" + dsn.user);
            if (dsn.pass) {
                header.push("sentry_secret=" + dsn.pass);
            }
            return {
                'Content-Type': 'application/json',
                'X-Sentry-Auth': header.join(', '),
            };
        };
        /** Returns the url to the report dialog endpoint. */
        API.prototype.getReportDialogEndpoint = function (dialogOptions) {
            if (dialogOptions === void 0) { dialogOptions = {}; }
            var dsn = this.dsnObject;
            var endpoint = "" + this.getBaseUrl() + (dsn.path ? "/" + dsn.path : '') + "/api/embed/error-page/";
            var encodedOptions = [];
            encodedOptions.push("dsn=" + dsn.toString());
            for (var key in dialogOptions) {
                if (key === 'user') {
                    if (!dialogOptions.user) {
                        continue;
                    }
                    if (dialogOptions.user.name) {
                        encodedOptions.push("name=" + encodeURIComponent(dialogOptions.user.name));
                    }
                    if (dialogOptions.user.email) {
                        encodedOptions.push("email=" + encodeURIComponent(dialogOptions.user.email));
                    }
                }
                else {
                    encodedOptions.push(encodeURIComponent(key) + "=" + encodeURIComponent(dialogOptions[key]));
                }
            }
            if (encodedOptions.length) {
                return endpoint + "?" + encodedOptions.join('&');
            }
            return endpoint;
        };
        return API;
    }());

    /**
     * Consumes the promise and logs the error when it rejects.
     * @param promise A promise to forget.
     */
    function forget(promise) {
        promise.catch(function (e) {
            // TODO: Use a better logging mechanism
            console.error(e);
        });
    }

    /**
     * Encodes given object into url-friendly format
     *
     * @param str An object that contains serializable values
     * @param max Maximum number of characters in truncated string
     * @returns string Encoded
     */
    function truncate(str, max) {
        if (max === void 0) { max = 0; }
        if (max === 0 || !isString(str)) {
            return str;
        }
        return str.length <= max ? str : str.substr(0, max) + "\u2026";
    }
    /**
     * Join values in array
     * @param input array of values to be joined together
     * @param delimiter string to be placed in-between values
     * @returns Joined values
     */
    function safeJoin(input, delimiter) {
        var e_1, _a;
        if (!Array.isArray(input)) {
            return '';
        }
        var output = [];
        try {
            for (var input_1 = __values(input), input_1_1 = input_1.next(); !input_1_1.done; input_1_1 = input_1.next()) {
                var value = input_1_1.value;
                try {
                    output.push(String(value));
                }
                catch (e) {
                    output.push('[value cannot be serialized]');
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (input_1_1 && !input_1_1.done && (_a = input_1.return)) _a.call(input_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return output.join(delimiter);
    }
    /**
     * Checks if given value is included in the target
     * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes#Polyfill
     * @param target source string
     * @param search string to be looked for
     * @returns An answer
     */
    function includes(target, search) {
        if (search.length > target.length) {
            return false;
        }
        else {
            return target.indexOf(search) !== -1;
        }
    }

    var installedIntegrations = [];
    /** Gets integration to install */
    function getIntegrationsToSetup(options) {
        var e_1, _a, e_2, _b;
        var defaultIntegrations = (options.defaultIntegrations && __spread(options.defaultIntegrations)) || [];
        var userIntegrations = options.integrations;
        var integrations = [];
        if (Array.isArray(userIntegrations)) {
            var userIntegrationsNames = userIntegrations.map(function (i) { return i.name; });
            var pickedIntegrationsNames = [];
            try {
                // Leave only unique default integrations, that were not overridden with provided user integrations
                for (var defaultIntegrations_1 = __values(defaultIntegrations), defaultIntegrations_1_1 = defaultIntegrations_1.next(); !defaultIntegrations_1_1.done; defaultIntegrations_1_1 = defaultIntegrations_1.next()) {
                    var defaultIntegration = defaultIntegrations_1_1.value;
                    if (userIntegrationsNames.indexOf(getIntegrationName(defaultIntegration)) === -1 &&
                        pickedIntegrationsNames.indexOf(getIntegrationName(defaultIntegration)) === -1) {
                        integrations.push(defaultIntegration);
                        pickedIntegrationsNames.push(getIntegrationName(defaultIntegration));
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (defaultIntegrations_1_1 && !defaultIntegrations_1_1.done && (_a = defaultIntegrations_1.return)) _a.call(defaultIntegrations_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
            try {
                // Don't add same user integration twice
                for (var userIntegrations_1 = __values(userIntegrations), userIntegrations_1_1 = userIntegrations_1.next(); !userIntegrations_1_1.done; userIntegrations_1_1 = userIntegrations_1.next()) {
                    var userIntegration = userIntegrations_1_1.value;
                    if (pickedIntegrationsNames.indexOf(getIntegrationName(userIntegration)) === -1) {
                        integrations.push(userIntegration);
                        pickedIntegrationsNames.push(getIntegrationName(userIntegration));
                    }
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (userIntegrations_1_1 && !userIntegrations_1_1.done && (_b = userIntegrations_1.return)) _b.call(userIntegrations_1);
                }
                finally { if (e_2) throw e_2.error; }
            }
        }
        else if (typeof userIntegrations === 'function') {
            integrations = userIntegrations(defaultIntegrations);
            integrations = Array.isArray(integrations) ? integrations : [integrations];
        }
        else {
            return __spread(defaultIntegrations);
        }
        return integrations;
    }
    /** Setup given integration */
    function setupIntegration(integration, options) {
        if (installedIntegrations.indexOf(getIntegrationName(integration)) !== -1) {
            return;
        }
        try {
            integration.setupOnce();
        }
        catch (_Oo) {
            /** @deprecated */
            // TODO: Remove in v5
            logger.warn("Integration " + getIntegrationName(integration) + ": The install method is deprecated. Use \"setupOnce\".");
            // tslint:disable:deprecation
            if (integration.install) {
                integration.install(options);
            }
            // tslint:enable:deprecation
        }
        installedIntegrations.push(getIntegrationName(integration));
        logger.log("Integration installed: " + getIntegrationName(integration));
    }
    /**
     * Given a list of integration instances this installs them all. When `withDefaults` is set to `true` then all default
     * integrations are added unless they were already provided before.
     * @param integrations array of integration instances
     * @param withDefault should enable default integrations
     */
    function setupIntegrations(options) {
        var integrations = {};
        getIntegrationsToSetup(options).forEach(function (integration) {
            integrations[getIntegrationName(integration)] = integration;
            setupIntegration(integration, options);
        });
        return integrations;
    }
    /**
     * Returns the integration static id.
     * @param integration Integration to retrieve id
     */
    function getIntegrationName(integration) {
        /**
         * @depracted
         */
        // tslint:disable-next-line:no-unsafe-any
        return integration.constructor.id || integration.name;
    }

    /**
     * Default maximum number of breadcrumbs added to an event. Can be overwritten
     * with {@link Options.maxBreadcrumbs}.
     */
    var DEFAULT_BREADCRUMBS = 30;
    /**
     * Absolute maximum number of breadcrumbs added to an event. The
     * `maxBreadcrumbs` option cannot be higher than this value.
     */
    var MAX_BREADCRUMBS = 100;
    /**
     * By default, truncates URL values to 250 chars
     */
    var MAX_URL_LENGTH = 250;
    /**
     * Base implementation for all JavaScript SDK clients.
     *
     * Call the constructor with the corresponding backend constructor and options
     * specific to the client subclass. To access these options later, use
     * {@link Client.getOptions}. Also, the Backend instance is available via
     * {@link Client.getBackend}.
     *
     * If a Dsn is specified in the options, it will be parsed and stored. Use
     * {@link Client.getDsn} to retrieve the Dsn at any moment. In case the Dsn is
     * invalid, the constructor will throw a {@link SentryException}. Note that
     * without a valid Dsn, the SDK will not send any events to Sentry.
     *
     * Before sending an event via the backend, it is passed through
     * {@link BaseClient.prepareEvent} to add SDK information and scope data
     * (breadcrumbs and context). To add more custom information, override this
     * method and extend the resulting prepared event.
     *
     * To issue automatically created events (e.g. via instrumentation), use
     * {@link Client.captureEvent}. It will prepare the event and pass it through
     * the callback lifecycle. To issue auto-breadcrumbs, use
     * {@link Client.addBreadcrumb}.
     *
     * @example
     * class NodeClient extends BaseClient<NodeBackend, NodeOptions> {
     *   public constructor(options: NodeOptions) {
     *     super(NodeBackend, options);
     *   }
     *
     *   // ...
     * }
     */
    var BaseClient = /** @class */ (function () {
        /**
         * Initializes this client instance.
         *
         * @param backendClass A constructor function to create the backend.
         * @param options Options for the client.
         */
        function BaseClient(backendClass, options) {
            this.backend = new backendClass(options);
            this.options = options;
            if (options.dsn) {
                this.dsn = new Dsn(options.dsn);
            }
            // We have to setup the integrations in the constructor since we do not want
            // that anyone needs to call client.install();
            this.integrations = setupIntegrations(this.options);
        }
        /**
         * @inheritDoc
         */
        BaseClient.prototype.install = function () {
            if (!this.isEnabled()) {
                return (this.installed = false);
            }
            var backend = this.getBackend();
            if (!this.installed && backend.install) {
                backend.install();
            }
            return (this.installed = true);
        };
        /**
         * Internal helper function to buffer promises.
         *
         * @param promise Any promise, but in this case Promise<SentryResponse>.
         */
        BaseClient.prototype.buffer = function (promise) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    return [2 /*return*/, this.getBackend()
                            .getBuffer()
                            .add(promise)];
                });
            });
        };
        /**
         * @inheritDoc
         */
        BaseClient.prototype.captureException = function (exception, hint, scope) {
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                return __generator(this, function (_a) {
                    return [2 /*return*/, this.buffer((function () { return __awaiter(_this, void 0, void 0, function () {
                            var event;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.getBackend().eventFromException(exception, hint)];
                                    case 1:
                                        event = _a.sent();
                                        return [2 /*return*/, this.captureEvent(event, hint, scope)];
                                }
                            });
                        }); })())];
                });
            });
        };
        /**
         * @inheritDoc
         */
        BaseClient.prototype.captureMessage = function (message, level, hint, scope) {
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                return __generator(this, function (_a) {
                    return [2 /*return*/, this.buffer((function () { return __awaiter(_this, void 0, void 0, function () {
                            var event;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.getBackend().eventFromMessage(message, level, hint)];
                                    case 1:
                                        event = _a.sent();
                                        return [2 /*return*/, this.captureEvent(event, hint, scope)];
                                }
                            });
                        }); })())];
                });
            });
        };
        /**
         * @inheritDoc
         */
        BaseClient.prototype.captureEvent = function (event, hint, scope) {
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                return __generator(this, function (_a) {
                    // Adding this here is technically not correct since if you call captureMessage/captureException it's already
                    // buffered. But since we not really need the count and we only need to know if the buffer is full or not,
                    // This is fine...
                    return [2 /*return*/, this.buffer((function () { return __awaiter(_this, void 0, void 0, function () {
                            var _this = this;
                            return __generator(this, function (_a) {
                                return [2 /*return*/, this.processEvent(event, function (finalEvent) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                        return [2 /*return*/, this.getBackend().sendEvent(finalEvent)];
                                    }); }); }, hint, scope)];
                            });
                        }); })())];
                });
            });
        };
        /**
         * @inheritDoc
         */
        BaseClient.prototype.addBreadcrumb = function (breadcrumb, hint, scope) {
            var _a = this.getOptions(), beforeBreadcrumb = _a.beforeBreadcrumb, _b = _a.maxBreadcrumbs, maxBreadcrumbs = _b === void 0 ? DEFAULT_BREADCRUMBS : _b;
            if (maxBreadcrumbs <= 0) {
                return;
            }
            var timestamp = new Date().getTime() / 1000;
            var mergedBreadcrumb = __assign({ timestamp: timestamp }, breadcrumb);
            var finalBreadcrumb = beforeBreadcrumb
                ? consoleSandbox(function () { return beforeBreadcrumb(mergedBreadcrumb, hint); })
                : mergedBreadcrumb;
            if (finalBreadcrumb === null) {
                return;
            }
            if (this.getBackend().storeBreadcrumb(finalBreadcrumb) && scope) {
                scope.addBreadcrumb(finalBreadcrumb, Math.min(maxBreadcrumbs, MAX_BREADCRUMBS));
            }
        };
        /**
         * @inheritDoc
         */
        BaseClient.prototype.getDsn = function () {
            return this.dsn;
        };
        /**
         * @inheritDoc
         */
        BaseClient.prototype.getOptions = function () {
            return this.options;
        };
        /** Returns the current backend. */
        BaseClient.prototype.getBackend = function () {
            return this.backend;
        };
        /** Determines whether this SDK is enabled and a valid Dsn is present. */
        BaseClient.prototype.isEnabled = function () {
            return this.getOptions().enabled !== false && this.dsn !== undefined;
        };
        /**
         * Adds common information to events.
         *
         * The information includes release and environment from `options`,
         * breadcrumbs and context (extra, tags and user) from the scope.
         *
         * Information that is already present in the event is never overwritten. For
         * nested objects, such as the context, keys are merged.
         *
         * @param event The original event.
         * @param hint May contain additional informartion about the original exception.
         * @param scope A scope containing event metadata.
         * @returns A new event with more information.
         */
        BaseClient.prototype.prepareEvent = function (event, scope, hint) {
            return __awaiter(this, void 0, void 0, function () {
                var _a, environment, _b, maxBreadcrumbs, release, dist, prepared, exception, request;
                return __generator(this, function (_c) {
                    _a = this.getOptions(), environment = _a.environment, _b = _a.maxBreadcrumbs, maxBreadcrumbs = _b === void 0 ? DEFAULT_BREADCRUMBS : _b, release = _a.release, dist = _a.dist;
                    prepared = __assign({}, event);
                    if (prepared.environment === undefined && environment !== undefined) {
                        prepared.environment = environment;
                    }
                    if (prepared.release === undefined && release !== undefined) {
                        prepared.release = release;
                    }
                    if (prepared.dist === undefined && dist !== undefined) {
                        prepared.dist = dist;
                    }
                    if (prepared.message) {
                        prepared.message = truncate(prepared.message, MAX_URL_LENGTH);
                    }
                    exception = prepared.exception && prepared.exception.values && prepared.exception.values[0];
                    if (exception && exception.value) {
                        exception.value = truncate(exception.value, MAX_URL_LENGTH);
                    }
                    request = prepared.request;
                    if (request && request.url) {
                        request.url = truncate(request.url, MAX_URL_LENGTH);
                    }
                    if (prepared.event_id === undefined) {
                        prepared.event_id = uuid4();
                    }
                    // This should be the last thing called, since we want that
                    // {@link Hub.addEventProcessor} gets the finished prepared event.
                    if (scope) {
                        return [2 /*return*/, scope.applyToEvent(prepared, hint, Math.min(maxBreadcrumbs, MAX_BREADCRUMBS))];
                    }
                    return [2 /*return*/, prepared];
                });
            });
        };
        /**
         * Processes an event (either error or message) and sends it to Sentry.
         *
         * This also adds breadcrumbs and context information to the event. However,
         * platform specific meta data (such as the User's IP address) must be added
         * by the SDK implementor.
         *
         * The returned event status offers clues to whether the event was sent to
         * Sentry and accepted there. If the {@link Options.shouldSend} hook returns
         * `false`, the status will be {@link SendStatus.Skipped}. If the rate limit
         * was exceeded, the status will be {@link SendStatus.RateLimit}.
         *
         * @param event The event to send to Sentry.
         * @param send A function to actually send the event.
         * @param scope A scope containing event metadata.
         * @param hint May contain additional informartion about the original exception.
         * @returns A Promise that resolves with the event status.
         */
        BaseClient.prototype.processEvent = function (event, send, hint, scope) {
            return __awaiter(this, void 0, void 0, function () {
                var _a, beforeSend, sampleRate, prepared, finalEvent, isInternalException, exception_1, response;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (!this.isEnabled()) {
                                return [2 /*return*/, {
                                        status: exports.Status.Skipped,
                                    }];
                            }
                            _a = this.getOptions(), beforeSend = _a.beforeSend, sampleRate = _a.sampleRate;
                            // 1.0 === 100% events are sent
                            // 0.0 === 0% events are sent
                            if (typeof sampleRate === 'number' && Math.random() > sampleRate) {
                                return [2 /*return*/, {
                                        status: exports.Status.Skipped,
                                    }];
                            }
                            return [4 /*yield*/, this.prepareEvent(event, scope, hint)];
                        case 1:
                            prepared = _b.sent();
                            if (prepared === null) {
                                return [2 /*return*/, {
                                        status: exports.Status.Skipped,
                                    }];
                            }
                            finalEvent = prepared;
                            _b.label = 2;
                        case 2:
                            _b.trys.push([2, 5, , 6]);
                            isInternalException = hint && hint.data && hint.data.__sentry__ === true;
                            if (!(!isInternalException && beforeSend)) return [3 /*break*/, 4];
                            return [4 /*yield*/, beforeSend(prepared, hint)];
                        case 3:
                            finalEvent = _b.sent();
                            if (typeof finalEvent === 'undefined') {
                                logger.error('`beforeSend` method has to return `null` or a valid event');
                            }
                            _b.label = 4;
                        case 4: return [3 /*break*/, 6];
                        case 5:
                            exception_1 = _b.sent();
                            forget(this.captureException(exception_1, {
                                data: {
                                    __sentry__: true,
                                },
                                originalException: exception_1,
                            }));
                            return [2 /*return*/, {
                                    reason: 'Event processing in beforeSend method threw an exception',
                                    status: exports.Status.Invalid,
                                }];
                        case 6:
                            if (finalEvent === null) {
                                return [2 /*return*/, {
                                        reason: 'Event dropped due to being discarded by beforeSend method',
                                        status: exports.Status.Skipped,
                                    }];
                            }
                            return [4 /*yield*/, send(finalEvent)];
                        case 7:
                            response = _b.sent();
                            response.event = finalEvent;
                            if (response.status === exports.Status.RateLimit) ;
                            return [2 /*return*/, response];
                    }
                });
            });
        };
        /**
         * @inheritDoc
         */
        BaseClient.prototype.close = function (timeout) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    return [2 /*return*/, this.getBackend()
                            .getBuffer()
                            .drain(timeout)];
                });
            });
        };
        /**
         * @inheritDoc
         */
        BaseClient.prototype.getIntegrations = function () {
            return this.integrations || {};
        };
        /**
         * @inheritDoc
         */
        BaseClient.prototype.getIntegration = function (integration) {
            try {
                return this.integrations[integration.id] || null;
            }
            catch (_oO) {
                logger.warn("Cannot retrieve integration " + integration.id + " from the current Client");
                return null;
            }
        };
        return BaseClient;
    }());

    /** A simple queue that holds promises. */
    var RequestBuffer = /** @class */ (function () {
        function RequestBuffer() {
            /** Internal set of queued Promises */
            this.buffer = [];
        }
        /**
         * Add a promise to the queue.
         *
         * @param task Can be any Promise<T>
         * @returns The original promise.
         */
        RequestBuffer.prototype.add = function (task) {
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                return __generator(this, function (_a) {
                    if (this.buffer.indexOf(task) === -1) {
                        this.buffer.push(task);
                    }
                    task.then(function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2 /*return*/, this.remove(task)];
                    }); }); }).catch(function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2 /*return*/, this.remove(task)];
                    }); }); });
                    return [2 /*return*/, task];
                });
            });
        };
        /**
         * Remove a promise to the queue.
         *
         * @param task Can be any Promise<T>
         * @returns Removed promise.
         */
        RequestBuffer.prototype.remove = function (task) {
            return __awaiter(this, void 0, void 0, function () {
                var removedTask;
                return __generator(this, function (_a) {
                    removedTask = this.buffer.splice(this.buffer.indexOf(task), 1)[0];
                    return [2 /*return*/, removedTask];
                });
            });
        };
        /**
         * This function returns the number of unresolved promises in the queue.
         */
        RequestBuffer.prototype.length = function () {
            return this.buffer.length;
        };
        /**
         * This will drain the whole queue, returns true if queue is empty or drained.
         * If timeout is provided and the queue takes longer to drain, the promise still resolves but with false.
         *
         * @param timeout Number in ms to wait until it resolves with false.
         */
        RequestBuffer.prototype.drain = function (timeout) {
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                return __generator(this, function (_a) {
                    return [2 /*return*/, new Promise(function (resolve) {
                            var capturedSetTimeout = setTimeout(function () {
                                if (timeout && timeout > 0) {
                                    resolve(false);
                                }
                            }, timeout);
                            Promise.all(_this.buffer)
                                .then(function () {
                                clearTimeout(capturedSetTimeout);
                                resolve(true);
                            })
                                .catch(function () {
                                resolve(true);
                            });
                        })];
                });
            });
        };
        return RequestBuffer;
    }());

    /**
     * This is the base implemention of a Backend.
     */
    var BaseBackend = /** @class */ (function () {
        /** Creates a new browser backend instance. */
        function BaseBackend(options) {
            /** A simple buffer holding all requests. */
            this.buffer = new RequestBuffer();
            this.options = options;
            if (!this.options.dsn) {
                logger.warn('No DSN provided, backend will not do anything.');
            }
        }
        /**
         * @inheritDoc
         */
        BaseBackend.prototype.eventFromException = function (_exception, _hint) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    throw new SentryError('Backend has to implement `eventFromException` method');
                });
            });
        };
        /**
         * @inheritDoc
         */
        BaseBackend.prototype.eventFromMessage = function (_message, _level, _hint) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    throw new SentryError('Backend has to implement `eventFromMessage` method');
                });
            });
        };
        /**
         * @inheritDoc
         */
        BaseBackend.prototype.sendEvent = function (_event) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    throw new SentryError('Backend has to implement `sendEvent` method');
                });
            });
        };
        /**
         * @inheritDoc
         */
        BaseBackend.prototype.storeBreadcrumb = function (_) {
            return true;
        };
        /**
         * @inheritDoc
         */
        BaseBackend.prototype.storeScope = function (_) {
            // Noop
        };
        /**
         * @inheritDoc
         */
        BaseBackend.prototype.getBuffer = function () {
            return this.buffer;
        };
        return BaseBackend;
    }());

    /** Console logging verbosity for the SDK. */
    var LogLevel;
    (function (LogLevel) {
        /** No logs will be generated. */
        LogLevel[LogLevel["None"] = 0] = "None";
        /** Only SDK internal errors will be logged. */
        LogLevel[LogLevel["Error"] = 1] = "Error";
        /** Information useful for debugging the SDK will be logged. */
        LogLevel[LogLevel["Debug"] = 2] = "Debug";
        /** All SDK actions will be logged. */
        LogLevel[LogLevel["Verbose"] = 3] = "Verbose";
    })(LogLevel || (LogLevel = {}));

    /**
     * Internal function to create a new SDK client instance. The client is
     * installed and then bound to the current scope.
     *
     * @param clientClass The client class to instanciate.
     * @param options Options to pass to the client.
     * @returns The installed and bound client instance.
     */
    function initAndBind(clientClass, options) {
        if (options.debug === true) {
            logger.enable();
        }
        if (getCurrentHub().getClient()) {
            return;
        }
        var client = new clientClass(options);
        getCurrentHub().bindClient(client);
        client.install();
    }

    /** Deduplication filter */
    var Dedupe = /** @class */ (function () {
        function Dedupe() {
            /**
             * @inheritDoc
             */
            this.name = Dedupe.id;
        }
        /**
         * @inheritDoc
         */
        Dedupe.prototype.setupOnce = function () {
            var _this = this;
            addGlobalEventProcessor(function (currentEvent) { return __awaiter(_this, void 0, void 0, function () {
                var self;
                return __generator(this, function (_a) {
                    self = getCurrentHub().getIntegration(Dedupe);
                    if (self) {
                        // Juuust in case something goes wrong
                        try {
                            if (self.shouldDropEvent(currentEvent, self.previousEvent)) {
                                return [2 /*return*/, null];
                            }
                        }
                        catch (_oO) {
                            return [2 /*return*/, (self.previousEvent = currentEvent)];
                        }
                        return [2 /*return*/, (self.previousEvent = currentEvent)];
                    }
                    return [2 /*return*/, currentEvent];
                });
            }); });
        };
        /** JSDoc */
        Dedupe.prototype.shouldDropEvent = function (currentEvent, previousEvent) {
            if (!previousEvent) {
                return false;
            }
            if (this.isSameMessageEvent(currentEvent, previousEvent)) {
                logger.warn("Event dropped due to being a duplicate of previous event (same message).\nEvent: " + getEventDescription(currentEvent));
                return true;
            }
            if (this.isSameExceptionEvent(currentEvent, previousEvent)) {
                logger.warn("Event dropped due to being a duplicate of previous event (same exception).\nEvent: " + getEventDescription(currentEvent));
                return true;
            }
            return false;
        };
        /** JSDoc */
        Dedupe.prototype.isSameMessageEvent = function (currentEvent, previousEvent) {
            var currentMessage = currentEvent.message;
            var previousMessage = previousEvent.message;
            // If no event has a message, they were both exceptions, so bail out
            if (!currentMessage && !previousMessage) {
                return false;
            }
            // If only one event has a stacktrace, but not the other one, they are not the same
            if ((currentMessage && !previousMessage) || (!currentMessage && previousMessage)) {
                return false;
            }
            if (currentMessage !== previousMessage) {
                return false;
            }
            if (!this.isSameFingerprint(currentEvent, previousEvent)) {
                return false;
            }
            if (!this.isSameStacktrace(currentEvent, previousEvent)) {
                return false;
            }
            return true;
        };
        /** JSDoc */
        Dedupe.prototype.getFramesFromEvent = function (event) {
            var exception = event.exception;
            if (exception) {
                try {
                    // @ts-ignore
                    return exception.values[0].stacktrace.frames;
                }
                catch (_oO) {
                    return undefined;
                }
            }
            else if (event.stacktrace) {
                return event.stacktrace.frames;
            }
            else {
                return undefined;
            }
        };
        /** JSDoc */
        Dedupe.prototype.isSameStacktrace = function (currentEvent, previousEvent) {
            var currentFrames = this.getFramesFromEvent(currentEvent);
            var previousFrames = this.getFramesFromEvent(previousEvent);
            // If no event has a fingerprint, they are assumed to be the same
            if (!currentFrames && !previousFrames) {
                return true;
            }
            // If only one event has a stacktrace, but not the other one, they are not the same
            if ((currentFrames && !previousFrames) || (!currentFrames && previousFrames)) {
                return false;
            }
            currentFrames = currentFrames;
            previousFrames = previousFrames;
            // If number of frames differ, they are not the same
            if (previousFrames.length !== currentFrames.length) {
                return false;
            }
            // Otherwise, compare the two
            for (var i = 0; i < previousFrames.length; i++) {
                var frameA = previousFrames[i];
                var frameB = currentFrames[i];
                if (frameA.filename !== frameB.filename ||
                    frameA.lineno !== frameB.lineno ||
                    frameA.colno !== frameB.colno ||
                    frameA.function !== frameB.function) {
                    return false;
                }
            }
            return true;
        };
        /** JSDoc */
        Dedupe.prototype.getExceptionFromEvent = function (event) {
            return event.exception && event.exception.values && event.exception.values[0];
        };
        /** JSDoc */
        Dedupe.prototype.isSameExceptionEvent = function (currentEvent, previousEvent) {
            var previousException = this.getExceptionFromEvent(previousEvent);
            var currentException = this.getExceptionFromEvent(currentEvent);
            if (!previousException || !currentException) {
                return false;
            }
            if (previousException.type !== currentException.type || previousException.value !== currentException.value) {
                return false;
            }
            if (!this.isSameFingerprint(currentEvent, previousEvent)) {
                return false;
            }
            if (!this.isSameStacktrace(currentEvent, previousEvent)) {
                return false;
            }
            return true;
        };
        /** JSDoc */
        Dedupe.prototype.isSameFingerprint = function (currentEvent, previousEvent) {
            var currentFingerprint = currentEvent.fingerprint;
            var previousFingerprint = previousEvent.fingerprint;
            // If no event has a fingerprint, they are assumed to be the same
            if (!currentFingerprint && !previousFingerprint) {
                return true;
            }
            // If only one event has a fingerprint, but not the other one, they are not the same
            if ((currentFingerprint && !previousFingerprint) || (!currentFingerprint && previousFingerprint)) {
                return false;
            }
            currentFingerprint = currentFingerprint;
            previousFingerprint = previousFingerprint;
            // Otherwise, compare the two
            try {
                return !!(currentFingerprint.join('') === previousFingerprint.join(''));
            }
            catch (_oO) {
                return false;
            }
        };
        /**
         * @inheritDoc
         */
        Dedupe.id = 'Dedupe';
        return Dedupe;
    }());

    var originalFunctionToString;
    /** Patch toString calls to return proper name for wrapped functions */
    var FunctionToString = /** @class */ (function () {
        function FunctionToString() {
            /**
             * @inheritDoc
             */
            this.name = FunctionToString.id;
        }
        /**
         * @inheritDoc
         */
        FunctionToString.prototype.setupOnce = function () {
            originalFunctionToString = Function.prototype.toString;
            Function.prototype.toString = function () {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                var context = this.__sentry__ ? this.__sentry_original__ : this;
                // tslint:disable-next-line:no-unsafe-any
                return originalFunctionToString.apply(context, args);
            };
        };
        /**
         * @inheritDoc
         */
        FunctionToString.id = 'FunctionToString';
        return FunctionToString;
    }());

    /**
     * @deprecated
     * This file can be safely removed in the next major bump
     */
    /** Adds SDK info to an event. */
    var SDKInformation = /** @class */ (function () {
        function SDKInformation() {
            /**
             * @inheritDoc
             */
            this.name = 'SDKInformation';
        }
        /**
         * @inheritDoc
         */
        SDKInformation.prototype.setupOnce = function () {
            logger.warn("SDKInformation Integration is deprecated and can be safely removed. It's functionality has been merged into the SDK's core.");
        };
        return SDKInformation;
    }());

    // "Script error." is hard coded into browsers for errors that it can't read.
    // this is the result of a script being pulled in from an external domain and CORS.
    var DEFAULT_IGNORE_ERRORS = [/^Script error\.?$/, /^Javascript error: Script error\.? on line 0$/];
    /** Inbound filters configurable by the user */
    var InboundFilters = /** @class */ (function () {
        function InboundFilters(options) {
            if (options === void 0) { options = {}; }
            this.options = options;
            /**
             * @inheritDoc
             */
            this.name = InboundFilters.id;
        }
        /**
         * @inheritDoc
         */
        InboundFilters.prototype.setupOnce = function () {
            var _this = this;
            addGlobalEventProcessor(function (event) { return __awaiter(_this, void 0, void 0, function () {
                var hub, self, client, clientOptions, options;
                return __generator(this, function (_a) {
                    hub = getCurrentHub();
                    if (!hub) {
                        return [2 /*return*/, event];
                    }
                    self = hub.getIntegration(InboundFilters);
                    if (self) {
                        client = hub.getClient();
                        clientOptions = client ? client.getOptions() : {};
                        options = self.mergeOptions(clientOptions);
                        if (self.shouldDropEvent(event, options)) {
                            return [2 /*return*/, null];
                        }
                    }
                    return [2 /*return*/, event];
                });
            }); });
        };
        /** JSDoc */
        InboundFilters.prototype.shouldDropEvent = function (event, options) {
            if (this.isSentryError(event, options)) {
                logger.warn("Event dropped due to being internal Sentry Error.\nEvent: " + getEventDescription(event));
                return true;
            }
            if (this.isIgnoredError(event, options)) {
                logger.warn("Event dropped due to being matched by `ignoreErrors` option.\nEvent: " + getEventDescription(event));
                return true;
            }
            if (this.isBlacklistedUrl(event, options)) {
                logger.warn("Event dropped due to being matched by `blacklistUrls` option.\nEvent: " + getEventDescription(event) + ".\nUrl: " + this.getEventFilterUrl(event));
                return true;
            }
            if (!this.isWhitelistedUrl(event, options)) {
                logger.warn("Event dropped due to not being matched by `whitelistUrls` option.\nEvent: " + getEventDescription(event) + ".\nUrl: " + this.getEventFilterUrl(event));
                return true;
            }
            return false;
        };
        /** JSDoc */
        InboundFilters.prototype.isSentryError = function (event, options) {
            if (options === void 0) { options = {}; }
            if (!options.ignoreInternal) {
                return false;
            }
            try {
                // tslint:disable-next-line:no-unsafe-any
                return event.exception.values[0].type === 'SentryError';
            }
            catch (_oO) {
                return false;
            }
        };
        /** JSDoc */
        InboundFilters.prototype.isIgnoredError = function (event, options) {
            var _this = this;
            if (options === void 0) { options = {}; }
            if (!options.ignoreErrors || !options.ignoreErrors.length) {
                return false;
            }
            return this.getPossibleEventMessages(event).some(function (message) {
                // Not sure why TypeScript complains here...
                return options.ignoreErrors.some(function (pattern) { return _this.isMatchingPattern(message, pattern); });
            });
        };
        /** JSDoc */
        InboundFilters.prototype.isBlacklistedUrl = function (event, options) {
            var _this = this;
            if (options === void 0) { options = {}; }
            // TODO: Use Glob instead?
            if (!options.blacklistUrls || !options.blacklistUrls.length) {
                return false;
            }
            var url = this.getEventFilterUrl(event);
            return !url ? false : options.blacklistUrls.some(function (pattern) { return _this.isMatchingPattern(url, pattern); });
        };
        /** JSDoc */
        InboundFilters.prototype.isWhitelistedUrl = function (event, options) {
            var _this = this;
            if (options === void 0) { options = {}; }
            // TODO: Use Glob instead?
            if (!options.whitelistUrls || !options.whitelistUrls.length) {
                return true;
            }
            var url = this.getEventFilterUrl(event);
            return !url ? true : options.whitelistUrls.some(function (pattern) { return _this.isMatchingPattern(url, pattern); });
        };
        /** JSDoc */
        InboundFilters.prototype.mergeOptions = function (clientOptions) {
            if (clientOptions === void 0) { clientOptions = {}; }
            return {
                blacklistUrls: __spread((this.options.blacklistUrls || []), (clientOptions.blacklistUrls || [])),
                ignoreErrors: __spread((this.options.ignoreErrors || []), (clientOptions.ignoreErrors || []), DEFAULT_IGNORE_ERRORS),
                ignoreInternal: typeof this.options.ignoreInternal !== 'undefined' ? this.options.ignoreInternal : true,
                whitelistUrls: __spread((this.options.whitelistUrls || []), (clientOptions.whitelistUrls || [])),
            };
        };
        /** JSDoc */
        InboundFilters.prototype.isMatchingPattern = function (value, pattern) {
            if (isRegExp(pattern)) {
                return pattern.test(value);
            }
            else if (typeof pattern === 'string') {
                return includes(value, pattern);
            }
            else {
                return false;
            }
        };
        /** JSDoc */
        InboundFilters.prototype.getPossibleEventMessages = function (event) {
            if (event.message) {
                return [event.message];
            }
            else if (event.exception) {
                try {
                    // tslint:disable-next-line:no-unsafe-any
                    var _a = event.exception.values[0], type = _a.type, value = _a.value;
                    return ["" + value, type + ": " + value];
                }
                catch (oO) {
                    logger.error("Cannot extract message for event " + getEventDescription(event));
                    return [];
                }
            }
            else {
                return [];
            }
        };
        /** JSDoc */
        InboundFilters.prototype.getEventFilterUrl = function (event) {
            try {
                if (event.stacktrace) {
                    // tslint:disable-next-line:no-unsafe-any
                    return event.stacktrace.frames[0].filename;
                }
                else if (event.exception) {
                    // tslint:disable-next-line:no-unsafe-any
                    return event.exception.values[0].stacktrace.frames[0].filename;
                }
                else {
                    return null;
                }
            }
            catch (oO) {
                logger.error("Cannot extract url for event " + getEventDescription(event));
                return null;
            }
        };
        /**
         * @inheritDoc
         */
        InboundFilters.id = 'InboundFilters';
        return InboundFilters;
    }());

    /** JSDoc */
    var Debug = /** @class */ (function () {
        /**
         * @inheritDoc
         */
        function Debug(options) {
            /**
             * @inheritDoc
             */
            this.name = Debug.id;
            this.options = __assign({ debugger: false, stringify: false }, options);
        }
        /**
         * @inheritDoc
         */
        Debug.prototype.setupOnce = function () {
            var _this = this;
            addGlobalEventProcessor(function (event, hint) { return __awaiter(_this, void 0, void 0, function () {
                var self;
                return __generator(this, function (_a) {
                    self = getCurrentHub().getIntegration(Debug);
                    if (self) {
                        // tslint:disable:no-console
                        // tslint:disable:no-debugger
                        if (self.options.debugger) {
                            debugger;
                        }
                        if (self.options.stringify) {
                            console.log(JSON.stringify(event, null, 2));
                            if (hint) {
                                console.log(JSON.stringify(hint, null, 2));
                            }
                        }
                        else {
                            console.log(event);
                            if (hint) {
                                console.log(hint);
                            }
                        }
                    }
                    return [2 /*return*/, event];
                });
            }); });
        };
        /**
         * @inheritDoc
         */
        Debug.id = 'Debug';
        return Debug;
    }());

    // Slightly modified (no IE8 support, ES6) and transcribed to TypeScript
    // https://raw.githubusercontent.com/calvinmetcalf/rollup-plugin-node-builtins/master/src/es6/path.js
    /** JSDoc */
    function normalizeArray(parts, allowAboveRoot) {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
            var last = parts[i];
            if (last === '.') {
                parts.splice(i, 1);
            }
            else if (last === '..') {
                parts.splice(i, 1);
                up++;
            }
            else if (up) {
                parts.splice(i, 1);
                up--;
            }
        }
        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
            for (; up--; up) {
                parts.unshift('..');
            }
        }
        return parts;
    }
    // Split a filename into [root, dir, basename, ext], unix version
    // 'root' is just a slash, or nothing.
    var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
    /** JSDoc */
    function splitPath(filename) {
        var parts = splitPathRe.exec(filename);
        return parts ? parts.slice(1) : [];
    }
    // path.resolve([from ...], to)
    // posix version
    /** JSDoc */
    function resolve() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var resolvedPath = '';
        var resolvedAbsolute = false;
        for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
            var path = i >= 0 ? args[i] : '/';
            // Skip empty entries
            if (!path) {
                continue;
            }
            resolvedPath = path + "/" + resolvedPath;
            resolvedAbsolute = path.charAt(0) === '/';
        }
        // At this point the path should be resolved to a full absolute path, but
        // handle relative paths to be safe (might happen when process.cwd() fails)
        // Normalize the path
        resolvedPath = normalizeArray(resolvedPath.split('/').filter(function (p) { return !!p; }), !resolvedAbsolute).join('/');
        return (resolvedAbsolute ? '/' : '') + resolvedPath || '.';
    }
    /** JSDoc */
    function trim(arr) {
        var start = 0;
        for (; start < arr.length; start++) {
            if (arr[start] !== '') {
                break;
            }
        }
        var end = arr.length - 1;
        for (; end >= 0; end--) {
            if (arr[end] !== '') {
                break;
            }
        }
        if (start > end) {
            return [];
        }
        return arr.slice(start, end - start + 1);
    }
    // path.relative(from, to)
    // posix version
    /** JSDoc */
    function relative(from, to) {
        // tslint:disable:no-parameter-reassignment
        from = resolve(from).substr(1);
        to = resolve(to).substr(1);
        var fromParts = trim(from.split('/'));
        var toParts = trim(to.split('/'));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
            if (fromParts[i] !== toParts[i]) {
                samePartsLength = i;
                break;
            }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
            outputParts.push('..');
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join('/');
    }
    /** JSDoc */
    function basename(path, ext) {
        var f = splitPath(path)[2];
        if (ext && f.substr(ext.length * -1) === ext) {
            f = f.substr(0, f.length - ext.length);
        }
        return f;
    }

    /** Rewrite event frames paths */
    var RewriteFrames = /** @class */ (function () {
        /**
         * @inheritDoc
         */
        function RewriteFrames(options) {
            if (options === void 0) { options = {}; }
            var _this = this;
            /**
             * @inheritDoc
             */
            this.name = RewriteFrames.id;
            /**
             * @inheritDoc
             */
            this.iteratee = function (frame) { return __awaiter(_this, void 0, void 0, function () {
                var base;
                return __generator(this, function (_a) {
                    if (frame.filename && frame.filename.startsWith('/')) {
                        base = this.root ? relative(this.root, frame.filename) : basename(frame.filename);
                        frame.filename = "app:///" + base;
                    }
                    return [2 /*return*/, frame];
                });
            }); };
            if (options.root) {
                this.root = options.root;
            }
            if (options.iteratee) {
                this.iteratee = options.iteratee;
            }
        }
        /**
         * @inheritDoc
         */
        RewriteFrames.prototype.setupOnce = function () {
            var _this = this;
            addGlobalEventProcessor(function (event) { return __awaiter(_this, void 0, void 0, function () {
                var self;
                return __generator(this, function (_a) {
                    self = getCurrentHub().getIntegration(RewriteFrames);
                    if (self) {
                        return [2 /*return*/, self.process(event)];
                    }
                    return [2 /*return*/, event];
                });
            }); });
        };
        /** JSDoc */
        RewriteFrames.prototype.process = function (event) {
            return __awaiter(this, void 0, void 0, function () {
                var frames, _a, _b, _i, i, _c, _d;
                return __generator(this, function (_e) {
                    switch (_e.label) {
                        case 0:
                            frames = this.getFramesFromEvent(event);
                            if (!frames) return [3 /*break*/, 4];
                            _a = [];
                            for (_b in frames)
                                _a.push(_b);
                            _i = 0;
                            _e.label = 1;
                        case 1:
                            if (!(_i < _a.length)) return [3 /*break*/, 4];
                            i = _a[_i];
                            // tslint:disable-next-line
                            _c = frames;
                            _d = i;
                            return [4 /*yield*/, this.iteratee(frames[i])];
                        case 2:
                            // tslint:disable-next-line
                            _c[_d] = _e.sent();
                            _e.label = 3;
                        case 3:
                            _i++;
                            return [3 /*break*/, 1];
                        case 4: return [2 /*return*/, event];
                    }
                });
            });
        };
        /** JSDoc */
        RewriteFrames.prototype.getFramesFromEvent = function (event) {
            var exception = event.exception;
            if (exception) {
                try {
                    // tslint:disable-next-line:no-unsafe-any
                    return exception.values[0].stacktrace.frames;
                }
                catch (_oO) {
                    return undefined;
                }
            }
            else if (event.stacktrace) {
                return event.stacktrace.frames;
            }
            else {
                return undefined;
            }
        };
        /**
         * @inheritDoc
         */
        RewriteFrames.id = 'RewriteFrames';
        return RewriteFrames;
    }());



    var CoreIntegrations = /*#__PURE__*/Object.freeze({
        Dedupe: Dedupe,
        FunctionToString: FunctionToString,
        SDKInformation: SDKInformation,
        InboundFilters: InboundFilters,
        Debug: Debug,
        RewriteFrames: RewriteFrames
    });

    /**
     * Tells whether current environment supports Fetch API
     * {@link supportsFetch}.
     *
     * @returns Answer to the given question.
     */
    function supportsFetch() {
        if (!('fetch' in getGlobalObject())) {
            return false;
        }
        try {
            // tslint:disable-next-line:no-unused-expression
            new Headers();
            // tslint:disable-next-line:no-unused-expression
            new Request('');
            // tslint:disable-next-line:no-unused-expression
            new Response();
            return true;
        }
        catch (e) {
            return false;
        }
    }
    /**
     * Tells whether current environment supports Fetch API natively
     * {@link supportsNativeFetch}.
     *
     * @returns Answer to the given question.
     */
    function supportsNativeFetch() {
        if (!supportsFetch()) {
            return false;
        }
        var global = getGlobalObject();
        var fetch = global.fetch;
        // tslint:disable-next-line:no-unsafe-any
        return fetch.toString().indexOf('native') !== -1;
    }
    /**
     * Tells whether current environment supports sendBeacon API
     * {@link supportsBeacon}.
     *
     * @returns Answer to the given question.
     */
    function supportsBeacon() {
        var global = getGlobalObject();
        return 'navigator' in global && 'sendBeacon' in global.navigator;
    }
    /**
     * Tells whether current environment supports ReportingObserver API
     * {@link supportsReportingObserver}.
     *
     * @returns Answer to the given question.
     */
    function supportsReportingObserver() {
        return 'ReportingObserver' in getGlobalObject();
    }
    /**
     * Tells whether current environment supports Referrer Policy API
     * {@link supportsReferrerPolicy}.
     *
     * @returns Answer to the given question.
     */
    function supportsReferrerPolicy() {
        // Despite all stars in the sky saying that Edge supports old draft syntax, aka 'never', 'always', 'origin' and 'default
        // https://caniuse.com/#feat=referrer-policy
        // It doesn't. And it throw exception instead of ignoring this parameter...
        // REF: https://github.com/getsentry/raven-js/issues/1233
        if (!supportsFetch()) {
            return false;
        }
        try {
            // tslint:disable:no-unused-expression
            new Request('pickleRick', {
                referrerPolicy: 'origin',
            });
            return true;
        }
        catch (e) {
            return false;
        }
    }
    /**
     * Tells whether current environment supports History API
     * {@link supportsHistory}.
     *
     * @returns Answer to the given question.
     */
    function supportsHistory() {
        // NOTE: in Chrome App environment, touching history.pushState, *even inside
        //       a try/catch block*, will cause Chrome to output an error to console.error
        // borrowed from: https://github.com/angular/angular.js/pull/13945/files
        var global = getGlobalObject();
        var chrome = global.chrome;
        // tslint:disable-next-line:no-unsafe-any
        var isChromePackagedApp = chrome && chrome.app && chrome.app.runtime;
        var hasHistoryApi = 'history' in global && !!global.history.pushState && !!global.history.replaceState;
        return !isChromePackagedApp && hasHistoryApi;
    }

    // tslint:disable
    /*
     * JavaScript MD5
     * https://github.com/blueimp/JavaScript-MD5
     *
     * Copyright 2011, Sebastian Tschan
     * https://blueimp.net
     *
     * Licensed under the MIT license:
     * https://opensource.org/licenses/MIT
     *
     * Based on
     * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
     * Digest Algorithm, as defined in RFC 1321.
     * Version 2.2 Copyright (C) Paul Johnston 1999 - 2009
     * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
     * Distributed under the BSD License
     * See http://pajhome.org.uk/crypt/md5 for more info.
     */
    /**
     * Add integers, wrapping at 2^32. This uses 16-bit operations internally
     * to work around bugs in some JS interpreters.
     */
    function safeAdd(x, y) {
        var lsw = (x & 0xffff) + (y & 0xffff);
        var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xffff);
    }
    /**
     * Bitwise rotate a 32-bit number to the left.
     */
    function bitRotateLeft(num, cnt) {
        return (num << cnt) | (num >>> (32 - cnt));
    }
    /**
     * These functions implement the four basic operations the algorithm uses.
     */
    function md5cmn(q, a, b, x, s, t) {
        return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
    }
    function md5ff(a, b, c, d, x, s, t) {
        return md5cmn((b & c) | (~b & d), a, b, x, s, t);
    }
    function md5gg(a, b, c, d, x, s, t) {
        return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
    }
    function md5hh(a, b, c, d, x, s, t) {
        return md5cmn(b ^ c ^ d, a, b, x, s, t);
    }
    function md5ii(a, b, c, d, x, s, t) {
        return md5cmn(c ^ (b | ~d), a, b, x, s, t);
    }
    /**
     * Calculate the MD5 of an array of little-endian words, and a bit length.
     */
    function binlMD5(x, len) {
        /** append padding */
        x[len >> 5] |= 0x80 << len % 32;
        x[(((len + 64) >>> 9) << 4) + 14] = len;
        var i;
        var olda;
        var oldb;
        var oldc;
        var oldd;
        var a = 1732584193;
        var b = -271733879;
        var c = -1732584194;
        var d = 271733878;
        for (i = 0; i < x.length; i += 16) {
            olda = a;
            oldb = b;
            oldc = c;
            oldd = d;
            a = md5ff(a, b, c, d, x[i], 7, -680876936);
            d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
            c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
            b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
            a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
            d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
            c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
            b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
            a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
            d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
            c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
            b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
            a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
            d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
            c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
            b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);
            a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
            d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
            c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
            b = md5gg(b, c, d, a, x[i], 20, -373897302);
            a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
            d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
            c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
            b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
            a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
            d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
            c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
            b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
            a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
            d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
            c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
            b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);
            a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
            d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
            c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
            b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
            a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
            d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
            c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
            b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
            a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
            d = md5hh(d, a, b, c, x[i], 11, -358537222);
            c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
            b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
            a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
            d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
            c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
            b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);
            a = md5ii(a, b, c, d, x[i], 6, -198630844);
            d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
            c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
            b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
            a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
            d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
            c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
            b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
            a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
            d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
            c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
            b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
            a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
            d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
            c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
            b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);
            a = safeAdd(a, olda);
            b = safeAdd(b, oldb);
            c = safeAdd(c, oldc);
            d = safeAdd(d, oldd);
        }
        return [a, b, c, d];
    }
    /**
     * Convert an array of little-endian words to a string
     */
    function binl2rstr(input) {
        var i;
        var output = '';
        var length32 = input.length * 32;
        for (i = 0; i < length32; i += 8) {
            output += String.fromCharCode((input[i >> 5] >>> i % 32) & 0xff);
        }
        return output;
    }
    /**
     * Convert a raw string to an array of little-endian words
     * Characters >255 have their high-byte silently ignored.
     */
    function rstr2binl(input) {
        var i;
        var output = [];
        output[(input.length >> 2) - 1] = undefined;
        for (i = 0; i < output.length; i += 1) {
            output[i] = 0;
        }
        var length8 = input.length * 8;
        for (i = 0; i < length8; i += 8) {
            output[i >> 5] |= (input.charCodeAt(i / 8) & 0xff) << i % 32;
        }
        return output;
    }
    /**
     * Calculate the MD5 of a raw string
     */
    function rstrMD5(s) {
        return binl2rstr(binlMD5(rstr2binl(s), s.length * 8));
    }
    /**
     * Calculate the HMAC-MD5, of a key and some data (raw strings)
     */
    function rstrHMACMD5(key, data) {
        var i;
        var bkey = rstr2binl(key);
        var ipad = [];
        var opad = [];
        var hash;
        ipad[15] = opad[15] = undefined;
        if (bkey.length > 16) {
            bkey = binlMD5(bkey, key.length * 8);
        }
        for (i = 0; i < 16; i += 1) {
            ipad[i] = bkey[i] ^ 0x36363636;
            opad[i] = bkey[i] ^ 0x5c5c5c5c;
        }
        hash = binlMD5(ipad.concat(rstr2binl(data)), 512 + data.length * 8);
        return binl2rstr(binlMD5(opad.concat(hash), 512 + 128));
    }
    /**
     * Convert a raw string to a hex string
     */
    function rstr2hex(input) {
        var hexTab = '0123456789abcdef';
        var output = '';
        var x;
        var i;
        for (i = 0; i < input.length; i += 1) {
            x = input.charCodeAt(i);
            output += hexTab.charAt((x >>> 4) & 0x0f) + hexTab.charAt(x & 0x0f);
        }
        return output;
    }
    /**
     * Encode a string as utf-8
     */
    function str2rstrUTF8(input) {
        return unescape(encodeURIComponent(input));
    }
    /*
    * Take string arguments and return either raw or hex encoded strings
    */
    function rawMD5(s) {
        return rstrMD5(str2rstrUTF8(s));
    }
    function hexMD5(s) {
        return rstr2hex(rawMD5(s));
    }
    function rawHMACMD5(k, d) {
        return rstrHMACMD5(str2rstrUTF8(k), str2rstrUTF8(d));
    }
    function hexHMACMD5(k, d) {
        return rstr2hex(rawHMACMD5(k, d));
    }
    function md5(string, key, raw) {
        if (!key) {
            if (!raw) {
                return hexMD5(string);
            }
            return rawMD5(string);
        }
        if (!raw) {
            return hexHMACMD5(key, string);
        }
        return rawHMACMD5(key, string);
    }

    // tslint:disable
    /**
     * TraceKit - Cross brower stack traces
     *
     * This was originally forked from github.com/occ/TraceKit, but has since been
     * largely modified and is now maintained as part of Sentry JS SDK.
     *
     * NOTE: Last merge with upstream repository
     * Jul 11,2018 - #f03357c
     *
     * https://github.com/csnover/TraceKit
     * @license MIT
     * @namespace TraceKit
     */
    var window$1 = getGlobalObject();
    var TraceKit = {
        wrap: function () { return function () { }; },
        report: false,
        collectWindowErrors: false,
        computeStackTrace: false,
        remoteFetching: false,
        linesOfContext: false,
        extendToAsynchronousCallbacks: false,
    };
    // var TraceKit: TraceKitInterface = {};
    // var TraceKit = {};
    // global reference to slice
    var _slice = [].slice;
    var UNKNOWN_FUNCTION = '?';
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#Error_types
    var ERROR_TYPES_RE = /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?(.*)$/;
    /**
     * A better form of hasOwnProperty<br/>
     * Example: `_has(MainHostObject, property) === true/false`
     *
     * @param {Object} object to check property
     * @param {string} key to check
     * @return {Boolean} true if the object has the key and it is not inherited
     */
    function _has(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
    }
    /**
     * A safe form of location.href<br/>
     *
     * @return {string} location.href
     */
    function getLocationHref() {
        if (typeof document === 'undefined' || document.location == null)
            return '';
        return document.location.href;
    }
    /**
     * A safe form of location.origin<br/>
     *
     * @return {string} location.origin
     */
    function getLocationOrigin() {
        if (typeof document === 'undefined' || document.location == null)
            return '';
        // Oh dear IE10...
        if (!document.location.origin) {
            return (document.location.protocol +
                '//' +
                document.location.hostname +
                (document.location.port ? ':' + document.location.port : ''));
        }
        return document.location.origin;
    }
    /**
     * Wrap any function in a TraceKit reporter<br/>
     * Example: `func = TraceKit.wrap(func);`
     *
     * @param {Function} func Function to be wrapped
     * @return {Function} The wrapped func
     * @memberof TraceKit
     */
    TraceKit.wrap = function traceKitWrapper(func) {
        function wrapped() {
            try {
                // @ts-ignore
                return func.apply(this, arguments);
            }
            catch (e) {
                TraceKit.report(e);
                throw e;
            }
        }
        return wrapped;
    };
    /**
     * Cross-browser processing of unhandled exceptions
     *
     * Syntax:
     * ```js
     *   TraceKit.report.subscribe(function(stackInfo) { ... })
     *   TraceKit.report.unsubscribe(function(stackInfo) { ... })
     *   TraceKit.report(exception)
     *   try { ...code... } catch(ex) { TraceKit.report(ex); }
     * ```
     *
     * Supports:
     *   - Firefox: full stack trace with line numbers, plus column number
     *     on top frame; column number is not guaranteed
     *   - Opera: full stack trace with line and column numbers
     *   - Chrome: full stack trace with line and column numbers
     *   - Safari: line and column number for the top frame only; some frames
     *     may be missing, and column number is not guaranteed
     *   - IE: line and column number for the top frame only; some frames
     *     may be missing, and column number is not guaranteed
     *
     * In theory, TraceKit should work on all of the following versions:
     *   - IE5.5+ (only 8.0 tested)
     *   - Firefox 0.9+ (only 3.5+ tested)
     *   - Opera 7+ (only 10.50 tested; versions 9 and earlier may require
     *     Exceptions Have Stacktrace to be enabled in opera:config)
     *   - Safari 3+ (only 4+ tested)
     *   - Chrome 1+ (only 5+ tested)
     *   - Konqueror 3.5+ (untested)
     *
     * Requires TraceKit.computeStackTrace.
     *
     * Tries to catch all unhandled exceptions and report them to the
     * subscribed handlers. Please note that TraceKit.report will rethrow the
     * exception. This is REQUIRED in order to get a useful stack trace in IE.
     * If the exception does not reach the top of the browser, you will only
     * get a stack trace from the point where TraceKit.report was called.
     *
     * Handlers receive a TraceKit.StackTrace object as described in the
     * TraceKit.computeStackTrace docs.
     *
     * @memberof TraceKit
     * @namespace
     */
    TraceKit.report = (function reportModuleWrapper() {
        var handlers = [], lastException = null, lastExceptionStack = null;
        /**
         * Add a crash handler.
         * @param {Function} handler
         * @memberof TraceKit.report
         */
        function subscribe(handler) {
            // NOTE: We call both handlers manually in browser/integrations/globalhandler.ts
            // So user can choose which one he wants to attach
            // installGlobalHandler();
            // installGlobalUnhandledRejectionHandler();
            handlers.push(handler);
        }
        /**
         * Remove a crash handler.
         * @param {Function} handler
         * @memberof TraceKit.report
         */
        function unsubscribe(handler) {
            for (var i = handlers.length - 1; i >= 0; --i) {
                if (handlers[i] === handler) {
                    handlers.splice(i, 1);
                }
            }
            if (handlers.length === 0) {
                uninstallGlobalHandler();
                uninstallGlobalUnhandledRejectionHandler();
            }
        }
        /**
         * Dispatch stack information to all handlers.
         * @param {TraceKit.StackTrace} stack
         * @param {boolean} isWindowError Is this a top-level window error?
         * @param {Error=} error The error that's being handled (if available, null otherwise)
         * @memberof TraceKit.report
         * @throws An exception if an error occurs while calling an handler.
         */
        function notifyHandlers(stack, isWindowError, error) {
            var exception = null;
            if (isWindowError && !TraceKit.collectWindowErrors) {
                return;
            }
            for (var i in handlers) {
                if (_has(handlers, i)) {
                    try {
                        handlers[i](stack, isWindowError, error);
                    }
                    catch (inner) {
                        exception = inner;
                    }
                }
            }
            if (exception) {
                throw exception;
            }
        }
        var _oldOnerrorHandler, _onErrorHandlerInstalled;
        var _oldOnunhandledrejectionHandler, _onUnhandledRejectionHandlerInstalled;
        /**
         * Ensures all global unhandled exceptions are recorded.
         * Supported by Gecko and IE.
         * @param {string} message Error message.
         * @param {string} url URL of script that generated the exception.
         * @param {(number|string)} lineNo The line number at which the error occurred.
         * @param {(number|string)=} columnNo The column number at which the error occurred.
         * @param {Error=} errorObj The actual Error object.
         * @memberof TraceKit.report
         */
        function traceKitWindowOnError(message, url, lineNo, columnNo, errorObj) {
            var stack = null;
            // If 'errorObj' is ErrorEvent, get real Error from inside
            errorObj = isErrorEvent(errorObj) ? errorObj.error : errorObj;
            // If 'message' is ErrorEvent, get real message from inside
            message = isErrorEvent(message) ? message.message : message;
            if (lastExceptionStack) {
                TraceKit.computeStackTrace.augmentStackTraceWithInitialElement(lastExceptionStack, url, lineNo, message);
                processLastException();
            }
            else if (errorObj && isError(errorObj)) {
                stack = TraceKit.computeStackTrace(errorObj);
                stack.mechanism = 'onerror';
                notifyHandlers(stack, true, errorObj);
            }
            else {
                var location = {
                    url: url,
                    line: lineNo,
                    column: columnNo,
                };
                var name;
                var msg = message; // must be new var or will modify original `arguments`
                if ({}.toString.call(message) === '[object String]') {
                    var groups = message.match(ERROR_TYPES_RE);
                    if (groups) {
                        name = groups[1];
                        msg = groups[2];
                    }
                }
                location.func = TraceKit.computeStackTrace.guessFunctionName(location.url, location.line);
                location.context = TraceKit.computeStackTrace.gatherContext(location.url, location.line);
                stack = {
                    name: name,
                    message: msg,
                    mode: 'onerror',
                    mechanism: 'onerror',
                    stack: [
                        __assign({}, location, { 
                            // Firefox sometimes doesn't return url correctly and this is an old behavior
                            // that I prefer to port here as well.
                            // It can be altered only here, as previously it's using `location.url` for other things — Kamil
                            url: location.url || getLocationHref() }),
                    ],
                };
                notifyHandlers(stack, true, null);
            }
            if (_oldOnerrorHandler) {
                // @ts-ignore
                return _oldOnerrorHandler.apply(this, arguments);
            }
            return false;
        }
        /**
         * Ensures all unhandled rejections are recorded.
         * @param {PromiseRejectionEvent} e event.
         * @memberof TraceKit.report
         * @see https://developer.mozilla.org/en-US/docs/Web/API/WindowEventHandlers/onunhandledrejection
         * @see https://developer.mozilla.org/en-US/docs/Web/API/PromiseRejectionEvent
         */
        function traceKitWindowOnUnhandledRejection(e) {
            var err = (e && (e.detail ? e.detail.reason : e.reason)) || e;
            var stack = TraceKit.computeStackTrace(err);
            stack.mechanism = 'onunhandledrejection';
            notifyHandlers(stack, true, err);
        }
        /**
         * Install a global onerror handler
         * @memberof TraceKit.report
         */
        function installGlobalHandler() {
            if (_onErrorHandlerInstalled === true) {
                return;
            }
            _oldOnerrorHandler = window$1.onerror;
            window$1.onerror = traceKitWindowOnError;
            _onErrorHandlerInstalled = true;
        }
        /**
         * Uninstall the global onerror handler
         * @memberof TraceKit.report
         */
        function uninstallGlobalHandler() {
            if (_onErrorHandlerInstalled) {
                window$1.onerror = _oldOnerrorHandler;
                _onErrorHandlerInstalled = false;
            }
        }
        /**
         * Install a global onunhandledrejection handler
         * @memberof TraceKit.report
         */
        function installGlobalUnhandledRejectionHandler() {
            if (_onUnhandledRejectionHandlerInstalled === true) {
                return;
            }
            _oldOnunhandledrejectionHandler = window$1.onunhandledrejection;
            window$1.onunhandledrejection = traceKitWindowOnUnhandledRejection;
            _onUnhandledRejectionHandlerInstalled = true;
        }
        /**
         * Uninstall the global onunhandledrejection handler
         * @memberof TraceKit.report
         */
        function uninstallGlobalUnhandledRejectionHandler() {
            if (_onUnhandledRejectionHandlerInstalled) {
                window$1.onerror = _oldOnunhandledrejectionHandler;
                _onUnhandledRejectionHandlerInstalled = false;
            }
        }
        /**
         * Process the most recent exception
         * @memberof TraceKit.report
         */
        function processLastException() {
            var _lastExceptionStack = lastExceptionStack, _lastException = lastException;
            lastExceptionStack = null;
            lastException = null;
            notifyHandlers(_lastExceptionStack, false, _lastException);
        }
        /**
         * Reports an unhandled Error to TraceKit.
         * @param {Error} ex
         * @memberof TraceKit.report
         * @throws An exception if an incomplete stack trace is detected (old IE browsers).
         */
        function report(ex) {
            if (lastExceptionStack) {
                if (lastException === ex) {
                    return; // already caught by an inner catch block, ignore
                }
                else {
                    processLastException();
                }
            }
            var stack = TraceKit.computeStackTrace(ex);
            lastExceptionStack = stack;
            lastException = ex;
            // If the stack trace is incomplete, wait for 2 seconds for
            // slow slow IE to see if onerror occurs or not before reporting
            // this exception; otherwise, we will end up with an incomplete
            // stack trace
            setTimeout(function () {
                if (lastException === ex) {
                    processLastException();
                }
            }, stack.incomplete ? 2000 : 0);
            throw ex; // re-throw to propagate to the top level (and cause window.onerror)
        }
        report.subscribe = subscribe;
        report.unsubscribe = unsubscribe;
        report.installGlobalHandler = installGlobalHandler;
        report.installGlobalUnhandledRejectionHandler = installGlobalUnhandledRejectionHandler;
        return report;
    })();
    /**
     * An object representing a single stack frame.
     * @typedef {Object} StackFrame
     * @property {string} url The JavaScript or HTML file URL.
     * @property {string} func The function name, or empty for anonymous functions (if guessing did not work).
     * @property {string[]?} args The arguments passed to the function, if known.
     * @property {number=} line The line number, if known.
     * @property {number=} column The column number, if known.
     * @property {string[]} context An array of source code lines; the middle element corresponds to the correct line#.
     * @memberof TraceKit
     */
    /**
     * An object representing a JavaScript stack trace.
     * @typedef {Object} StackTrace
     * @property {string} name The name of the thrown exception.
     * @property {string} message The exception error message.
     * @property {TraceKit.StackFrame[]} stack An array of stack frames.
     * @property {string} mode 'stack', 'stacktrace', 'multiline', 'callers', 'onerror', or 'failed' -- method used to collect the stack trace.
     * @memberof TraceKit
     */
    /**
     * TraceKit.computeStackTrace: cross-browser stack traces in JavaScript
     *
     * Syntax:
     *   ```js
     *   s = TraceKit.computeStackTrace.ofCaller([depth])
     *   s = TraceKit.computeStackTrace(exception) // consider using TraceKit.report instead (see below)
     *   ```
     *
     * Supports:
     *   - Firefox:  full stack trace with line numbers and unreliable column
     *               number on top frame
     *   - Opera 10: full stack trace with line and column numbers
     *   - Opera 9-: full stack trace with line numbers
     *   - Chrome:   full stack trace with line and column numbers
     *   - Safari:   line and column number for the topmost stacktrace element
     *               only
     *   - IE:       no line numbers whatsoever
     *
     * Tries to guess names of anonymous functions by looking for assignments
     * in the source code. In IE and Safari, we have to guess source file names
     * by searching for function bodies inside all page scripts. This will not
     * work for scripts that are loaded cross-domain.
     * Here be dragons: some function names may be guessed incorrectly, and
     * duplicate functions may be mismatched.
     *
     * TraceKit.computeStackTrace should only be used for tracing purposes.
     * Logging of unhandled exceptions should be done with TraceKit.report,
     * which builds on top of TraceKit.computeStackTrace and provides better
     * IE support by utilizing the window.onerror event to retrieve information
     * about the top of the stack.
     *
     * Note: In IE and Safari, no stack trace is recorded on the Error object,
     * so computeStackTrace instead walks its *own* chain of callers.
     * This means that:
     *  * in Safari, some methods may be missing from the stack trace;
     *  * in IE, the topmost function in the stack trace will always be the
     *    caller of computeStackTrace.
     *
     * This is okay for tracing (because you are likely to be calling
     * computeStackTrace from the function you want to be the topmost element
     * of the stack trace anyway), but not okay for logging unhandled
     * exceptions (because your catch block will likely be far away from the
     * inner function that actually caused the exception).
     *
     * Tracing example:
     *  ```js
     *     function trace(message) {
     *         var stackInfo = TraceKit.computeStackTrace.ofCaller();
     *         var data = message + "\n";
     *         for(var i in stackInfo.stack) {
     *             var item = stackInfo.stack[i];
     *             data += (item.func || '[anonymous]') + "() in " + item.url + ":" + (item.line || '0') + "\n";
     *         }
     *         if (window.console)
     *             console.info(data);
     *         else
     *             alert(data);
     *     }
     * ```
     * @memberof TraceKit
     * @namespace
     */
    TraceKit.computeStackTrace = (function computeStackTraceWrapper() {
        var debug = false, sourceCache = {};
        /**
         * Attempts to retrieve source code via XMLHttpRequest, which is used
         * to look up anonymous function names.
         * @param {string} url URL of source code.
         * @return {string} Source contents.
         * @memberof TraceKit.computeStackTrace
         */
        function loadSource(url) {
            if (!TraceKit.remoteFetching) {
                //Only attempt request if remoteFetching is on.
                return '';
            }
            try {
                var getXHR = function () {
                    try {
                        return new window$1.XMLHttpRequest();
                    }
                    catch (e) {
                        // explicitly bubble up the exception if not found
                        return new window$1.ActiveXObject('Microsoft.XMLHTTP');
                    }
                };
                var request = getXHR();
                request.open('GET', url, false);
                request.send('');
                return request.responseText;
            }
            catch (e) {
                return '';
            }
        }
        /**
         * Retrieves source code from the source code cache.
         * @param {string} url URL of source code.
         * @return {Array.<string>} Source contents.
         * @memberof TraceKit.computeStackTrace
         */
        function getSource(url) {
            if (typeof url !== 'string') {
                return [];
            }
            if (!_has(sourceCache, url)) {
                // URL needs to be able to fetched within the acceptable domain.  Otherwise,
                // cross-domain errors will be triggered.
                /*
                            Regex matches:
                            0 - Full Url
                            1 - Protocol
                            2 - Domain
                            3 - Port (Useful for internal applications)
                            4 - Path
                        */
                var source = '';
                var domain = '';
                try {
                    domain = window$1.document.domain;
                }
                catch (e) { }
                var match = /(.*)\:\/\/([^:\/]+)([:\d]*)\/{0,1}([\s\S]*)/.exec(url);
                if (match && match[2] === domain) {
                    source = loadSource(url);
                }
                sourceCache[url] = source ? source.split('\n') : [];
            }
            return sourceCache[url];
        }
        /**
         * Tries to use an externally loaded copy of source code to determine
         * the name of a function by looking at the name of the variable it was
         * assigned to, if any.
         * @param {string} url URL of source code.
         * @param {(string|number)} lineNo Line number in source code.
         * @return {string} The function name, if discoverable.
         * @memberof TraceKit.computeStackTrace
         */
        function guessFunctionName(url, lineNo) {
            var reFunctionArgNames = /function ([^(]*)\(([^)]*)\)/, reGuessFunction = /['"]?([0-9A-Za-z$_]+)['"]?\s*[:=]\s*(function|eval|new Function)/, line = '', maxLines = 10, source = getSource(url), m;
            if (!source.length) {
                return UNKNOWN_FUNCTION;
            }
            // Walk backwards from the first line in the function until we find the line which
            // matches the pattern above, which is the function definition
            for (var i = 0; i < maxLines; ++i) {
                line = source[lineNo - i] + line;
                if (!isUndefined(line)) {
                    if ((m = reGuessFunction.exec(line))) {
                        return m[1];
                    }
                    else if ((m = reFunctionArgNames.exec(line))) {
                        return m[1];
                    }
                }
            }
            return UNKNOWN_FUNCTION;
        }
        /**
         * Retrieves the surrounding lines from where an exception occurred.
         * @param {string} url URL of source code.
         * @param {(string|number)} line Line number in source code to center around for context.
         * @return {?Array.<string>} Lines of source code.
         * @memberof TraceKit.computeStackTrace
         */
        function gatherContext(url, line) {
            var source = getSource(url);
            if (!source.length) {
                return null;
            }
            var context = [], 
            // linesBefore & linesAfter are inclusive with the offending line.
            // if linesOfContext is even, there will be one extra line
            //   *before* the offending line.
            linesBefore = Math.floor(TraceKit.linesOfContext / 2), 
            // Add one extra line if linesOfContext is odd
            linesAfter = linesBefore + (TraceKit.linesOfContext % 2), start = Math.max(0, line - linesBefore - 1), end = Math.min(source.length, line + linesAfter - 1);
            line -= 1; // convert to 0-based index
            for (var i = start; i < end; ++i) {
                if (!isUndefined(source[i])) {
                    context.push(source[i]);
                }
            }
            return context.length > 0 ? context : null;
        }
        /**
         * Escapes special characters, except for whitespace, in a string to be
         * used inside a regular expression as a string literal.
         * @param {string} text The string.
         * @return {string} The escaped string literal.
         * @memberof TraceKit.computeStackTrace
         */
        function escapeRegExp(text) {
            return text.replace(/[\-\[\]{}()*+?.,\\\^$|#]/g, '\\$&');
        }
        /**
         * Escapes special characters in a string to be used inside a regular
         * expression as a string literal. Also ensures that HTML entities will
         * be matched the same as their literal friends.
         * @param {string} body The string.
         * @return {string} The escaped string.
         * @memberof TraceKit.computeStackTrace
         */
        function escapeCodeAsRegExpForMatchingInsideHTML(body) {
            return escapeRegExp(body)
                .replace('<', '(?:<|&lt;)')
                .replace('>', '(?:>|&gt;)')
                .replace('&', '(?:&|&amp;)')
                .replace('"', '(?:"|&quot;)')
                .replace(/\s+/g, '\\s+');
        }
        /**
         * Determines where a code fragment occurs in the source code.
         * @param {RegExp} re The function definition.
         * @param {Array.<string>} urls A list of URLs to search.
         * @return {?Object.<string, (string|number)>} An object containing
         * the url, line, and column number of the defined function.
         * @memberof TraceKit.computeStackTrace
         */
        function findSourceInUrls(re, urls) {
            var source, m;
            for (var i = 0, j = urls.length; i < j; ++i) {
                if ((source = getSource(urls[i])).length) {
                    source = source.join('\n');
                    if ((m = re.exec(source))) {
                        return {
                            url: urls[i],
                            line: source.substring(0, m.index).split('\n').length,
                            column: m.index - source.lastIndexOf('\n', m.index) - 1,
                        };
                    }
                }
            }
            return null;
        }
        /**
         * Determines at which column a code fragment occurs on a line of the
         * source code.
         * @param {string} fragment The code fragment.
         * @param {string} url The URL to search.
         * @param {(string|number)} line The line number to examine.
         * @return {?number} The column number.
         * @memberof TraceKit.computeStackTrace
         */
        function findSourceInLine(fragment, url, line) {
            var source = getSource(url), re = new RegExp('\\b' + escapeRegExp(fragment) + '\\b'), m;
            line -= 1;
            if (source && source.length > line && (m = re.exec(source[line]))) {
                return m.index;
            }
            return null;
        }
        /**
         * Determines where a function was defined within the source code.
         * @param {(Function|string)} func A function reference or serialized
         * function definition.
         * @return {?Object.<string, (string|number)>} An object containing
         * the url, line, and column number of the defined function.
         * @memberof TraceKit.computeStackTrace
         */
        function findSourceByFunctionBody(func) {
            if (isUndefined(window$1 && window$1.document)) {
                return;
            }
            var urls = [getLocationHref()], scripts = window$1.document.getElementsByTagName('script'), body, code = '' + func, codeRE = /^function(?:\s+([\w$]+))?\s*\(([\w\s,]*)\)\s*\{\s*(\S[\s\S]*\S)\s*\}\s*$/, eventRE = /^function on([\w$]+)\s*\(event\)\s*\{\s*(\S[\s\S]*\S)\s*\}\s*$/, re, parts, result;
            for (var i = 0; i < scripts.length; ++i) {
                var script = scripts[i];
                if (script.src) {
                    urls.push(script.src);
                }
            }
            if (!(parts = codeRE.exec(code))) {
                re = new RegExp(escapeRegExp(code).replace(/\s+/g, '\\s+'));
            }
            // not sure if this is really necessary, but I don’t have a test
            // corpus large enough to confirm that and it was in the original.
            else {
                var name = parts[1] ? '\\s+' + parts[1] : '', args = parts[2].split(',').join('\\s*,\\s*');
                body = escapeRegExp(parts[3]).replace(/;$/, ';?'); // semicolon is inserted if the function ends with a comment.replace(/\s+/g, '\\s+');
                re = new RegExp('function' + name + '\\s*\\(\\s*' + args + '\\s*\\)\\s*{\\s*' + body + '\\s*}');
            }
            // look for a normal function definition
            if ((result = findSourceInUrls(re, urls))) {
                return result;
            }
            // look for an old-school event handler function
            if ((parts = eventRE.exec(code))) {
                var event = parts[1];
                body = escapeCodeAsRegExpForMatchingInsideHTML(parts[2]);
                // look for a function defined in HTML as an onXXX handler
                re = new RegExp('on' + event + '=[\\\'"]\\s*' + body + '\\s*[\\\'"]', 'i');
                if ((result = findSourceInUrls(re, urls[0]))) {
                    return result;
                }
                // look for ???
                re = new RegExp(body);
                if ((result = findSourceInUrls(re, urls))) {
                    return result;
                }
            }
            return null;
        }
        // Contents of Exception in various browsers.
        //
        // SAFARI:
        // ex.message = Can't find variable: qq
        // ex.line = 59
        // ex.sourceId = 580238192
        // ex.sourceURL = http://...
        // ex.expressionBeginOffset = 96
        // ex.expressionCaretOffset = 98
        // ex.expressionEndOffset = 98
        // ex.name = ReferenceError
        //
        // FIREFOX:
        // ex.message = qq is not defined
        // ex.fileName = http://...
        // ex.lineNumber = 59
        // ex.columnNumber = 69
        // ex.stack = ...stack trace... (see the example below)
        // ex.name = ReferenceError
        //
        // CHROME:
        // ex.message = qq is not defined
        // ex.name = ReferenceError
        // ex.type = not_defined
        // ex.arguments = ['aa']
        // ex.stack = ...stack trace...
        //
        // INTERNET EXPLORER:
        // ex.message = ...
        // ex.name = ReferenceError
        //
        // OPERA:
        // ex.message = ...message... (see the example below)
        // ex.name = ReferenceError
        // ex.opera#sourceloc = 11  (pretty much useless, duplicates the info in ex.message)
        // ex.stacktrace = n/a; see 'opera:config#UserPrefs|Exceptions Have Stacktrace'
        /**
         * Computes stack trace information from the stack property.
         * Chrome and Gecko use this property.
         * @param {Error} ex
         * @return {?TraceKit.StackTrace} Stack trace information.
         * @memberof TraceKit.computeStackTrace
         */
        function computeStackTraceFromStackProp(ex) {
            if (!ex.stack) {
                return null;
            }
            var chrome = /^\s*at (?:(.*?) ?\()?((?:file|https?|blob|chrome-extension|native|eval|webpack|<anonymous>|[a-z]:|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i, gecko = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)((?:file|https?|blob|chrome|webpack|resource|moz-extension).*?:\/.*?|\[native code\]|[^@]*bundle)(?::(\d+))?(?::(\d+))?\s*$/i, winjs = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i, 
            // Used to additionally parse URL/line/column from eval frames
            isEval, geckoEval = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i, chromeEval = /\((\S*)(?::(\d+))(?::(\d+))\)/, lines = ex.stack.split('\n'), stack = [], submatch, parts, element, reference = /^(.*) is undefined$/.exec(ex.message);
            for (var i = 0, j = lines.length; i < j; ++i) {
                if ((parts = chrome.exec(lines[i]))) {
                    var isNative = parts[2] && parts[2].indexOf('native') === 0; // start of line
                    isEval = parts[2] && parts[2].indexOf('eval') === 0; // start of line
                    if (isEval && (submatch = chromeEval.exec(parts[2]))) {
                        // throw out eval line/column and use top-most line/column number
                        parts[2] = submatch[1]; // url
                        // NOTE: It's messing out our integration tests in Karma, let's see if we can live with it – Kamil
                        // parts[3] = submatch[2]; // line
                        // parts[4] = submatch[3]; // column
                    }
                    element = {
                        url: !isNative ? parts[2] : null,
                        func: parts[1] || UNKNOWN_FUNCTION,
                        args: isNative ? [parts[2]] : [],
                        line: parts[3] ? +parts[3] : null,
                        column: parts[4] ? +parts[4] : null,
                    };
                }
                else if ((parts = winjs.exec(lines[i]))) {
                    element = {
                        url: parts[2],
                        func: parts[1] || UNKNOWN_FUNCTION,
                        args: [],
                        line: +parts[3],
                        column: parts[4] ? +parts[4] : null,
                    };
                }
                else if ((parts = gecko.exec(lines[i]))) {
                    isEval = parts[3] && parts[3].indexOf(' > eval') > -1;
                    if (isEval && (submatch = geckoEval.exec(parts[3]))) {
                        // throw out eval line/column and use top-most line number
                        parts[3] = submatch[1];
                        // NOTE: It's messing out our integration tests in Karma, let's see if we can live with it – Kamil
                        // parts[4] = submatch[2];
                        // parts[5] = null; // no column when eval
                    }
                    else if (i === 0 && !parts[5] && !isUndefined(ex.columnNumber)) {
                        // FireFox uses this awesome columnNumber property for its top frame
                        // Also note, Firefox's column number is 0-based and everything else expects 1-based,
                        // so adding 1
                        // NOTE: this hack doesn't work if top-most frame is eval
                        stack[0].column = ex.columnNumber + 1;
                    }
                    element = {
                        url: parts[3],
                        func: parts[1] || UNKNOWN_FUNCTION,
                        args: parts[2] ? parts[2].split(',') : [],
                        line: parts[4] ? +parts[4] : null,
                        column: parts[5] ? +parts[5] : null,
                    };
                }
                else {
                    continue;
                }
                if (!element.func && element.line) {
                    element.func = guessFunctionName(element.url, element.line);
                }
                if (TraceKit.remoteFetching && element.url && element.url.substr(0, 5) === 'blob:') {
                    // Special case for handling JavaScript loaded into a blob.
                    // We use a synchronous AJAX request here as a blob is already in
                    // memory - it's not making a network request.  This will generate a warning
                    // in the browser console, but there has already been an error so that's not
                    // that much of an issue.
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', element.url, false);
                    xhr.send('');
                    // If we failed to download the source, skip this patch
                    if (xhr.status === 200) {
                        var source = xhr.responseText || '';
                        // We trim the source down to the last 300 characters as sourceMappingURL is always at the end of the file.
                        // Why 300? To be in line with: https://github.com/getsentry/sentry/blob/4af29e8f2350e20c28a6933354e4f42437b4ba42/src/sentry/lang/javascript/processor.py#L164-L175
                        source = source.slice(-300);
                        // Now we dig out the source map URL
                        var sourceMaps = source.match(/\/\/# sourceMappingURL=(.*)$/);
                        // If we don't find a source map comment or we find more than one, continue on to the next element.
                        if (sourceMaps) {
                            var sourceMapAddress = sourceMaps[1];
                            // Now we check to see if it's a relative URL.
                            // If it is, convert it to an absolute one.
                            if (sourceMapAddress.charAt(0) === '~') {
                                sourceMapAddress = getLocationOrigin() + sourceMapAddress.slice(1);
                            }
                            // Now we strip the '.map' off of the end of the URL and update the
                            // element so that Sentry can match the map to the blob.
                            element.url = sourceMapAddress.slice(0, -4);
                        }
                    }
                }
                element.context = element.line ? gatherContext(element.url, element.line) : null;
                stack.push(element);
            }
            if (!stack.length) {
                return null;
            }
            if (stack[0] && stack[0].line && !stack[0].column && reference) {
                stack[0].column = findSourceInLine(reference[1], stack[0].url, stack[0].line);
            }
            return {
                mode: 'stack',
                name: ex.name,
                message: ex.message,
                stack: stack,
            };
        }
        /**
         * Computes stack trace information from the stacktrace property.
         * Opera 10+ uses this property.
         * @param {Error} ex
         * @return {?TraceKit.StackTrace} Stack trace information.
         * @memberof TraceKit.computeStackTrace
         */
        function computeStackTraceFromStacktraceProp(ex) {
            // Access and store the stacktrace property before doing ANYTHING
            // else to it because Opera is not very good at providing it
            // reliably in other circumstances.
            var stacktrace = ex.stacktrace;
            if (!stacktrace) {
                return;
            }
            var opera10Regex = / line (\d+).*script (?:in )?(\S+)(?:: in function (\S+))?$/i, opera11Regex = / line (\d+), column (\d+)\s*(?:in (?:<anonymous function: ([^>]+)>|([^\)]+))\((.*)\))? in (.*):\s*$/i, lines = stacktrace.split('\n'), stack = [], parts;
            for (var line = 0; line < lines.length; line += 2) {
                var element = null;
                if ((parts = opera10Regex.exec(lines[line]))) {
                    element = {
                        url: parts[2],
                        line: +parts[1],
                        column: null,
                        func: parts[3],
                        args: [],
                    };
                }
                else if ((parts = opera11Regex.exec(lines[line]))) {
                    element = {
                        url: parts[6],
                        line: +parts[1],
                        column: +parts[2],
                        func: parts[3] || parts[4],
                        args: parts[5] ? parts[5].split(',') : [],
                    };
                }
                if (element) {
                    if (!element.func && element.line) {
                        element.func = guessFunctionName(element.url, element.line);
                    }
                    if (element.line) {
                        try {
                            element.context = gatherContext(element.url, element.line);
                        }
                        catch (exc) { }
                    }
                    if (!element.context) {
                        element.context = [lines[line + 1]];
                    }
                    stack.push(element);
                }
            }
            if (!stack.length) {
                return null;
            }
            return {
                mode: 'stacktrace',
                name: ex.name,
                message: ex.message,
                stack: stack,
            };
        }
        /**
         * NOT TESTED.
         * Computes stack trace information from an error message that includes
         * the stack trace.
         * Opera 9 and earlier use this method if the option to show stack
         * traces is turned on in opera:config.
         * @param {Error} ex
         * @return {?TraceKit.StackTrace} Stack information.
         * @memberof TraceKit.computeStackTrace
         */
        function computeStackTraceFromOperaMultiLineMessage(ex) {
            // TODO: Clean this function up
            // Opera includes a stack trace into the exception message. An example is:
            //
            // Statement on line 3: Undefined variable: undefinedFunc
            // Backtrace:
            //   Line 3 of linked script file://localhost/Users/andreyvit/Projects/TraceKit/javascript-client/sample.js: In function zzz
            //         undefinedFunc(a);
            //   Line 7 of inline#1 script in file://localhost/Users/andreyvit/Projects/TraceKit/javascript-client/sample.html: In function yyy
            //           zzz(x, y, z);
            //   Line 3 of inline#1 script in file://localhost/Users/andreyvit/Projects/TraceKit/javascript-client/sample.html: In function xxx
            //           yyy(a, a, a);
            //   Line 1 of function script
            //     try { xxx('hi'); return false; } catch(ex) { TraceKit.report(ex); }
            //   ...
            var lines = ex.message.split('\n');
            if (lines.length < 4) {
                return null;
            }
            var lineRE1 = /^\s*Line (\d+) of linked script ((?:file|https?|blob)\S+)(?:: in function (\S+))?\s*$/i, lineRE2 = /^\s*Line (\d+) of inline#(\d+) script in ((?:file|https?|blob)\S+)(?:: in function (\S+))?\s*$/i, lineRE3 = /^\s*Line (\d+) of function script\s*$/i, stack = [], scripts = window$1 && window$1.document && window$1.document.getElementsByTagName('script'), inlineScriptBlocks = [], parts;
            for (var s in scripts) {
                if (_has(scripts, s) && !scripts[s].src) {
                    inlineScriptBlocks.push(scripts[s]);
                }
            }
            for (var line = 2; line < lines.length; line += 2) {
                var item = null;
                if ((parts = lineRE1.exec(lines[line]))) {
                    item = {
                        url: parts[2],
                        func: parts[3],
                        args: [],
                        line: +parts[1],
                        column: null,
                    };
                }
                else if ((parts = lineRE2.exec(lines[line]))) {
                    item = {
                        url: parts[3],
                        func: parts[4],
                        args: [],
                        line: +parts[1],
                        column: null,
                    };
                    var relativeLine = +parts[1]; // relative to the start of the <SCRIPT> block
                    var script = inlineScriptBlocks[parts[2] - 1];
                    if (script) {
                        var source = getSource(item.url);
                        if (source) {
                            source = source.join('\n');
                            var pos = source.indexOf(script.innerText);
                            if (pos >= 0) {
                                item.line = relativeLine + source.substring(0, pos).split('\n').length;
                            }
                        }
                    }
                }
                else if ((parts = lineRE3.exec(lines[line]))) {
                    var url = getLocationHref().replace(/#.*$/, '');
                    var re = new RegExp(escapeCodeAsRegExpForMatchingInsideHTML(lines[line + 1]));
                    var src = findSourceInUrls(re, [url]);
                    item = {
                        url: url,
                        func: '',
                        args: [],
                        line: src ? src.line : parts[1],
                        column: null,
                    };
                }
                if (item) {
                    if (!item.func) {
                        item.func = guessFunctionName(item.url, item.line);
                    }
                    var context = gatherContext(item.url, item.line);
                    var midline = context ? context[Math.floor(context.length / 2)] : null;
                    if (context && midline.replace(/^\s*/, '') === lines[line + 1].replace(/^\s*/, '')) {
                        item.context = context;
                    }
                    else {
                        // if (context) alert("Context mismatch. Correct midline:\n" + lines[i+1] + "\n\nMidline:\n" + midline + "\n\nContext:\n" + context.join("\n") + "\n\nURL:\n" + item.url);
                        item.context = [lines[line + 1]];
                    }
                    stack.push(item);
                }
            }
            if (!stack.length) {
                return null; // could not parse multiline exception message as Opera stack trace
            }
            return {
                mode: 'multiline',
                name: ex.name,
                message: lines[0],
                stack: stack,
            };
        }
        /**
         * Adds information about the first frame to incomplete stack traces.
         * Safari and IE require this to get complete data on the first frame.
         * @param {TraceKit.StackTrace} stackInfo Stack trace information from
         * one of the compute* methods.
         * @param {string} url The URL of the script that caused an error.
         * @param {(number|string)} lineNo The line number of the script that
         * caused an error.
         * @param {string=} message The error generated by the browser, which
         * hopefully contains the name of the object that caused the error.
         * @return {boolean} Whether or not the stack information was
         * augmented.
         * @memberof TraceKit.computeStackTrace
         */
        function augmentStackTraceWithInitialElement(stackInfo, url, lineNo, message) {
            var initial = {
                url: url,
                line: lineNo,
            };
            if (initial.url && initial.line) {
                stackInfo.incomplete = false;
                if (!initial.func) {
                    initial.func = guessFunctionName(initial.url, initial.line);
                }
                if (!initial.context) {
                    initial.context = gatherContext(initial.url, initial.line);
                }
                var reference = / '([^']+)' /.exec(message);
                if (reference) {
                    initial.column = findSourceInLine(reference[1], initial.url, initial.line);
                }
                if (stackInfo.stack.length > 0) {
                    if (stackInfo.stack[0].url === initial.url) {
                        if (stackInfo.stack[0].line === initial.line) {
                            return false; // already in stack trace
                        }
                        else if (!stackInfo.stack[0].line && stackInfo.stack[0].func === initial.func) {
                            stackInfo.stack[0].line = initial.line;
                            stackInfo.stack[0].context = initial.context;
                            return false;
                        }
                    }
                }
                stackInfo.stack.unshift(initial);
                stackInfo.partial = true;
                return true;
            }
            else {
                stackInfo.incomplete = true;
            }
            return false;
        }
        /**
         * Computes stack trace information by walking the arguments.caller
         * chain at the time the exception occurred. This will cause earlier
         * frames to be missed but is the only way to get any stack trace in
         * Safari and IE. The top frame is restored by
         * {@link augmentStackTraceWithInitialElement}.
         * @param {Error} ex
         * @return {TraceKit.StackTrace=} Stack trace information.
         * @memberof TraceKit.computeStackTrace
         */
        function computeStackTraceByWalkingCallerChain(ex, depth) {
            var functionName = /function\s+([_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*)?\s*\(/i, stack = [], funcs = {}, recursion = false, parts, item, source;
            for (var curr = computeStackTraceByWalkingCallerChain.caller; curr && !recursion; curr = curr.caller) {
                if (curr === computeStackTrace || curr === TraceKit.report) {
                    continue;
                }
                item = {
                    url: null,
                    func: UNKNOWN_FUNCTION,
                    args: [],
                    line: null,
                    column: null,
                };
                if (curr.name) {
                    item.func = curr.name;
                }
                else if ((parts = functionName.exec(curr.toString()))) {
                    item.func = parts[1];
                }
                if (typeof item.func === 'undefined') {
                    try {
                        item.func = parts.input.substring(0, parts.input.indexOf('{'));
                    }
                    catch (e) { }
                }
                if ((source = findSourceByFunctionBody(curr))) {
                    item.url = source.url;
                    item.line = source.line;
                    if (item.func === UNKNOWN_FUNCTION) {
                        item.func = guessFunctionName(item.url, item.line);
                    }
                    var reference = / '([^']+)' /.exec(ex.message || ex.description);
                    if (reference) {
                        item.column = findSourceInLine(reference[1], source.url, source.line);
                    }
                }
                if (funcs['' + curr]) {
                    recursion = true;
                }
                else {
                    funcs['' + curr] = true;
                }
                stack.push(item);
            }
            if (depth) {
                stack.splice(0, depth);
            }
            var result = {
                mode: 'callers',
                name: ex.name,
                message: ex.message,
                stack: stack,
            };
            augmentStackTraceWithInitialElement(result, ex.sourceURL || ex.fileName, ex.line || ex.lineNumber, ex.message || ex.description);
            return result;
        }
        /**
         * Computes a stack trace for an exception.
         * @param {Error} ex
         * @param {(string|number)=} depth
         * @memberof TraceKit.computeStackTrace
         */
        function computeStackTrace(ex, depth) {
            var stack = null;
            depth = depth == null ? 0 : +depth;
            try {
                // This must be tried first because Opera 10 *destroys*
                // its stacktrace property if you try to access the stack
                // property first!!
                stack = computeStackTraceFromStacktraceProp(ex);
                if (stack) {
                    return stack;
                }
            }
            catch (e) {
                if (debug) {
                    throw e;
                }
            }
            try {
                stack = computeStackTraceFromStackProp(ex);
                if (stack) {
                    return stack;
                }
            }
            catch (e) {
                if (debug) {
                    throw e;
                }
            }
            try {
                stack = computeStackTraceFromOperaMultiLineMessage(ex);
                if (stack) {
                    return stack;
                }
            }
            catch (e) {
                if (debug) {
                    throw e;
                }
            }
            try {
                stack = computeStackTraceByWalkingCallerChain(ex, depth + 1);
                if (stack) {
                    return stack;
                }
            }
            catch (e) {
                if (debug) {
                    throw e;
                }
            }
            return {
                name: ex.name,
                message: ex.message,
                mode: 'failed',
            };
        }
        /**
         * Logs a stacktrace starting from the previous call and working down.
         * @param {(number|string)=} depth How many frames deep to trace.
         * @return {TraceKit.StackTrace} Stack trace information.
         * @memberof TraceKit.computeStackTrace
         */
        function computeStackTraceOfCaller(depth) {
            depth = (depth == null ? 0 : +depth) + 1; // "+ 1" because "ofCaller" should drop one frame
            try {
                throw new Error();
            }
            catch (ex) {
                return computeStackTrace(ex, depth + 1);
            }
        }
        computeStackTrace.augmentStackTraceWithInitialElement = augmentStackTraceWithInitialElement;
        computeStackTrace.computeStackTraceFromStackProp = computeStackTraceFromStackProp;
        computeStackTrace.guessFunctionName = guessFunctionName;
        computeStackTrace.gatherContext = gatherContext;
        computeStackTrace.ofCaller = computeStackTraceOfCaller;
        computeStackTrace.getSource = getSource;
        return computeStackTrace;
    })();
    /**
     * Extends support for global error handling for asynchronous browser
     * functions. Adopted from Closure Library's errorhandler.js
     * @memberof TraceKit
     */
    TraceKit.extendToAsynchronousCallbacks = function () {
        var _helper = function _helper(fnName) {
            var originalFn = window$1[fnName];
            window$1[fnName] = function traceKitAsyncExtension() {
                // Make a copy of the arguments
                var args = _slice.call(arguments);
                var originalCallback = args[0];
                if (typeof originalCallback === 'function') {
                    args[0] = TraceKit.wrap(originalCallback);
                }
                // IE < 9 doesn't support .call/.apply on setInterval/setTimeout, but it
                // also only supports 2 argument and doesn't care what "this" is, so we
                // can just call the original function directly.
                if (originalFn.apply) {
                    return originalFn.apply(this, args);
                }
                else {
                    return originalFn(args[0], args[1]);
                }
            };
        };
        _helper('setTimeout');
        _helper('setInterval');
    };
    TraceKit.remoteFetching = false;
    TraceKit.collectWindowErrors = true;
    TraceKit.linesOfContext = 11;
    var subscribe = TraceKit.report.subscribe;
    var installGlobalHandler = TraceKit.report.installGlobalHandler;
    var installGlobalUnhandledRejectionHandler = TraceKit.report.installGlobalUnhandledRejectionHandler;
    var computeStackTrace = TraceKit.computeStackTrace;

    var STACKTRACE_LIMIT = 50;
    /** JSDoc */
    function exceptionFromStacktrace(stacktrace) {
        var frames = prepareFramesForEvent(stacktrace.stack);
        var exception = {
            stacktrace: { frames: frames },
            type: stacktrace.name,
            value: stacktrace.message,
        };
        // tslint:disable-next-line:strict-type-predicates
        if (exception.type === undefined && exception.value === '') {
            exception.value = 'Unrecoverable error caught';
        }
        return exception;
    }
    /** JSDoc */
    function eventFromPlainObject(exception, syntheticException) {
        var exceptionKeys = Object.keys(exception).sort();
        var event = {
            extra: {
                __serialized__: limitObjectDepthToSize(exception),
            },
            fingerprint: [md5(exceptionKeys.join(''))],
            message: "Non-Error exception captured with keys: " + serializeKeysToEventMessage(exceptionKeys),
        };
        if (syntheticException) {
            var stacktrace = computeStackTrace(syntheticException);
            var frames_1 = prepareFramesForEvent(stacktrace.stack);
            event.stacktrace = {
                frames: frames_1,
            };
        }
        return event;
    }
    /** JSDoc */
    function eventFromStacktrace(stacktrace) {
        var exception = exceptionFromStacktrace(stacktrace);
        return {
            exception: {
                values: [exception],
            },
        };
    }
    /** JSDoc */
    function prepareFramesForEvent(stack) {
        if (!stack || !stack.length) {
            return [];
        }
        var localStack = stack;
        var firstFrameFunction = localStack[0].func || '';
        if (includes(firstFrameFunction, 'captureMessage') || includes(firstFrameFunction, 'captureException')) {
            localStack = localStack.slice(1);
        }
        // The frame where the crash happened, should be the last entry in the array
        return localStack
            .map(function (frame) { return ({
            colno: frame.column,
            filename: frame.url || localStack[0].url,
            function: frame.func || '?',
            in_app: true,
            lineno: frame.line,
        }); })
            .slice(0, STACKTRACE_LIMIT)
            .reverse();
    }

    /** Base Transport class implementation */
    var BaseTransport = /** @class */ (function () {
        function BaseTransport(options) {
            this.options = options;
            this.url = new API(this.options.dsn).getStoreEndpointWithUrlEncodedAuth();
        }
        /**
         * @inheritDoc
         */
        BaseTransport.prototype.captureEvent = function (_) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    throw new SentryError('Transport Class has to implement `captureEvent` method');
                });
            });
        };
        return BaseTransport;
    }());

    var global$2 = getGlobalObject();
    /** `fetch` based transport */
    var FetchTransport = /** @class */ (function (_super) {
        __extends(FetchTransport, _super);
        function FetchTransport() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        /**
         * @inheritDoc
         */
        FetchTransport.prototype.captureEvent = function (event) {
            return __awaiter(this, void 0, void 0, function () {
                var defaultOptions, response;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            defaultOptions = {
                                body: serialize(event),
                                method: 'POST',
                                // Despite all stars in the sky saying that Edge supports old draft syntax, aka 'never', 'always', 'origin' and 'default
                                // https://caniuse.com/#feat=referrer-policy
                                // It doesn't. And it throw exception instead of ignoring this parameter...
                                // REF: https://github.com/getsentry/raven-js/issues/1233
                                referrerPolicy: (supportsReferrerPolicy() ? 'origin' : ''),
                            };
                            return [4 /*yield*/, global$2.fetch(this.url, defaultOptions)];
                        case 1:
                            response = _a.sent();
                            return [2 /*return*/, {
                                    status: exports.Status.fromHttpCode(response.status),
                                }];
                    }
                });
            });
        };
        return FetchTransport;
    }(BaseTransport));

    /** `XHR` based transport */
    var XHRTransport = /** @class */ (function (_super) {
        __extends(XHRTransport, _super);
        function XHRTransport() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        /**
         * @inheritDoc
         */
        XHRTransport.prototype.captureEvent = function (event) {
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                return __generator(this, function (_a) {
                    return [2 /*return*/, new Promise(function (resolve, reject) {
                            var request = new XMLHttpRequest();
                            request.onreadystatechange = function () {
                                if (request.readyState !== 4) {
                                    return;
                                }
                                if (request.status === 200) {
                                    resolve({
                                        status: exports.Status.fromHttpCode(request.status),
                                    });
                                }
                                reject(request);
                            };
                            request.open('POST', _this.url);
                            request.send(serialize(event));
                        })];
                });
            });
        };
        return XHRTransport;
    }(BaseTransport));

    var global$3 = getGlobalObject();
    /** `sendBeacon` based transport */
    var BeaconTransport = /** @class */ (function (_super) {
        __extends(BeaconTransport, _super);
        function BeaconTransport() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        /**
         * @inheritDoc
         */
        BeaconTransport.prototype.captureEvent = function (event) {
            return __awaiter(this, void 0, void 0, function () {
                var data, result;
                return __generator(this, function (_a) {
                    data = serialize(event);
                    result = global$3.navigator.sendBeacon(this.url, data);
                    return [2 /*return*/, {
                            status: result ? exports.Status.Success : exports.Status.Failed,
                        }];
                });
            });
        };
        return BeaconTransport;
    }(BaseTransport));



    var index = /*#__PURE__*/Object.freeze({
        BaseTransport: BaseTransport,
        FetchTransport: FetchTransport,
        XHRTransport: XHRTransport,
        BeaconTransport: BeaconTransport
    });

    /** The Sentry Browser SDK Backend. */
    var BrowserBackend = /** @class */ (function (_super) {
        __extends(BrowserBackend, _super);
        function BrowserBackend() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        /**
         * @inheritDoc
         */
        BrowserBackend.prototype.install = function () {
            // We are only called by the client if the SDK is enabled and a valid Dsn
            // has been configured. If no Dsn is present, this indicates a programming
            // error.
            var dsn = this.options.dsn;
            if (!dsn) {
                throw new SentryError('Invariant exception: install() must not be called when disabled');
            }
            Error.stackTraceLimit = 50;
            return true;
        };
        /**
         * @inheritDoc
         */
        BrowserBackend.prototype.eventFromException = function (exception, hint) {
            return __awaiter(this, void 0, void 0, function () {
                var event, ex, ex, name_1, message, ex, ex;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!(isErrorEvent(exception) && exception.error)) return [3 /*break*/, 1];
                            ex = exception;
                            exception = ex.error; // tslint:disable-line:no-parameter-reassignment
                            event = eventFromStacktrace(computeStackTrace(exception));
                            return [3 /*break*/, 7];
                        case 1:
                            if (!(isDOMError(exception) || isDOMException(exception))) return [3 /*break*/, 3];
                            ex = exception;
                            name_1 = ex.name || (isDOMError(ex) ? 'DOMError' : 'DOMException');
                            message = ex.message ? name_1 + ": " + ex.message : name_1;
                            return [4 /*yield*/, this.eventFromMessage(message, undefined, hint)];
                        case 2:
                            event = _a.sent();
                            return [3 /*break*/, 7];
                        case 3:
                            if (!isError(exception)) return [3 /*break*/, 4];
                            // we have a real Error object, do nothing
                            event = eventFromStacktrace(computeStackTrace(exception));
                            return [3 /*break*/, 7];
                        case 4:
                            if (!(isPlainObject(exception) && hint && hint.syntheticException)) return [3 /*break*/, 5];
                            ex = exception;
                            event = eventFromPlainObject(ex, hint.syntheticException);
                            return [3 /*break*/, 7];
                        case 5:
                            ex = exception;
                            return [4 /*yield*/, this.eventFromMessage(ex, undefined, hint)];
                        case 6:
                            event = _a.sent();
                            _a.label = 7;
                        case 7:
                            event = __assign({}, event, { event_id: hint && hint.event_id, exception: __assign({}, event.exception, { mechanism: {
                                        handled: true,
                                        type: 'generic',
                                    } }) });
                            return [2 /*return*/, event];
                    }
                });
            });
        };
        /**
         * @inheritDoc
         */
        BrowserBackend.prototype.eventFromMessage = function (message, level, hint) {
            if (level === void 0) { level = exports.Severity.Info; }
            return __awaiter(this, void 0, void 0, function () {
                var event, stacktrace, frames_1;
                return __generator(this, function (_a) {
                    event = {
                        event_id: hint && hint.event_id,
                        level: level,
                        message: message,
                    };
                    if (this.options.attachStacktrace && hint && hint.syntheticException) {
                        stacktrace = computeStackTrace(hint.syntheticException);
                        frames_1 = prepareFramesForEvent(stacktrace.stack);
                        event.stacktrace = {
                            frames: frames_1,
                        };
                    }
                    return [2 /*return*/, event];
                });
            });
        };
        /**
         * @inheritDoc
         */
        BrowserBackend.prototype.sendEvent = function (event) {
            return __awaiter(this, void 0, void 0, function () {
                var transportOptions;
                return __generator(this, function (_a) {
                    if (!this.options.dsn) {
                        logger.warn("Event has been skipped because no Dsn is configured.");
                        // We do nothing in case there is no DSN
                        return [2 /*return*/, { status: exports.Status.Skipped, reason: "Event has been skipped because no Dsn is configured." }];
                    }
                    if (!this.transport) {
                        transportOptions = this.options.transportOptions
                            ? this.options.transportOptions
                            : { dsn: this.options.dsn };
                        if (this.options.transport) {
                            this.transport = new this.options.transport({ dsn: this.options.dsn });
                        }
                        else if (supportsBeacon()) {
                            this.transport = new BeaconTransport(transportOptions);
                        }
                        else if (supportsFetch()) {
                            this.transport = new FetchTransport(transportOptions);
                        }
                        else {
                            this.transport = new XHRTransport(transportOptions);
                        }
                    }
                    return [2 /*return*/, this.transport.captureEvent(event)];
                });
            });
        };
        return BrowserBackend;
    }(BaseBackend));

    var SDK_NAME = 'sentry.javascript.browser';
    var SDK_VERSION = '4.3.2';

    /**
     * The Sentry Browser SDK Client.
     *
     * @see BrowserOptions for documentation on configuration options.
     * @see SentryClient for usage documentation.
     */
    var BrowserClient = /** @class */ (function (_super) {
        __extends(BrowserClient, _super);
        /**
         * Creates a new Browser SDK instance.
         *
         * @param options Configuration options for this SDK.
         */
        function BrowserClient(options) {
            return _super.call(this, BrowserBackend, options) || this;
        }
        /**
         * @inheritDoc
         */
        BrowserClient.prototype.prepareEvent = function (event, scope, hint) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    event.platform = event.platform || 'javascript';
                    event.sdk = __assign({}, event.sdk, { name: SDK_NAME, packages: __spread(((event.sdk && event.sdk.packages) || []), [
                            {
                                name: 'npm:@sentry/browser',
                                version: SDK_VERSION,
                            },
                        ]), version: SDK_VERSION });
                    return [2 /*return*/, _super.prototype.prepareEvent.call(this, event, scope, hint)];
                });
            });
        };
        /**
         * Show a report dialog to the user to send feedback to a specific event.
         *
         * @param options Set individual options for the dialog
         */
        BrowserClient.prototype.showReportDialog = function (options) {
            if (options === void 0) { options = {}; }
            // doesn't work without a document (React Native)
            var document = getGlobalObject().document;
            if (!document) {
                return;
            }
            var dsn = options.dsn || this.getDsn();
            if (!options.eventId) {
                throw new SentryError('Missing `eventId` option in showReportDialog call');
            }
            if (!dsn) {
                throw new SentryError('Missing `Dsn` option in showReportDialog call');
            }
            var script = document.createElement('script');
            script.async = true;
            script.src = new API(dsn).getReportDialogEndpoint(options);
            (document.head || document.body).appendChild(script);
        };
        return BrowserClient;
    }(BaseClient));

    var debounceDuration = 1000;
    var keypressTimeout;
    var lastCapturedEvent;
    var ignoreOnError = 0;
    /** JSDoc */
    function shouldIgnoreOnError() {
        return ignoreOnError > 0;
    }
    /** JSDoc */
    function ignoreNextOnError() {
        // onerror should trigger before setTimeout
        ignoreOnError += 1;
        setTimeout(function () {
            ignoreOnError -= 1;
        });
    }
    /**
     * Instruments the given function and sends an event to Sentry every time the
     * function throws an exception.
     *
     * @param fn A function to wrap.
     * @returns The wrapped function.
     */
    function wrap(fn, options, before) {
        if (options === void 0) { options = {}; }
        if (!isFunction(fn)) {
            return fn;
        }
        try {
            // We don't wanna wrap it twice
            if (fn.__sentry__) {
                return fn;
            }
            // If this has already been wrapped in the past, return that wrapped function
            if (fn.__sentry_wrapped__) {
                return fn.__sentry_wrapped__;
            }
        }
        catch (e) {
            // Just accessing custom props in some Selenium environments
            // can cause a "Permission denied" exception (see raven-js#495).
            // Bail on wrapping and return the function as-is (defers to window.onerror).
            return fn;
        }
        var wrapped = function () {
            var _this = this;
            if (before && isFunction(before)) {
                before.apply(this, arguments);
            }
            var args = Array.prototype.slice.call(arguments);
            try {
                // Attempt to invoke user-land function
                // NOTE: If you are a Sentry user, and you are seeing this stack frame, it
                //       means Raven caught an error invoking your application code. This is
                //       expected behavior and NOT indicative of a bug with Raven.js.
                var wrappedArguments = args.map(function (arg) { return wrap(arg, options); });
                if (fn.handleEvent) {
                    return fn.handleEvent.apply(this, wrappedArguments);
                }
                else {
                    return fn.apply(this, wrappedArguments);
                }
            }
            catch (ex) {
                ignoreNextOnError();
                withScope(function (scope) { return __awaiter(_this, void 0, void 0, function () {
                    var _this = this;
                    return __generator(this, function (_a) {
                        scope.addEventProcessor(function (event) { return __awaiter(_this, void 0, void 0, function () {
                            var processedEvent;
                            return __generator(this, function (_a) {
                                processedEvent = __assign({}, event);
                                if (options.mechanism) {
                                    processedEvent.exception = processedEvent.exception || {};
                                    processedEvent.exception.mechanism = options.mechanism;
                                }
                                processedEvent.extra = __assign({}, processedEvent.extra, { arguments: serializeObject(args, 2) });
                                return [2 /*return*/, processedEvent];
                            });
                        }); });
                        getCurrentHub().captureException(ex, { originalException: ex });
                        return [2 /*return*/];
                    });
                }); });
                throw ex;
            }
        };
        // Accessing some objects may throw
        // ref: https://github.com/getsentry/sentry-javascript/issues/1168
        try {
            for (var property in fn) {
                if (Object.prototype.hasOwnProperty.call(fn, property)) {
                    wrapped[property] = fn[property];
                }
            }
        }
        catch (_oO) { } // tslint:disable-line:no-empty
        wrapped.prototype = fn.prototype;
        fn.__sentry_wrapped__ = wrapped;
        // Signal that this function has been wrapped/filled already
        // for both debugging and to prevent it to being wrapped/filled twice
        wrapped.__sentry__ = true;
        wrapped.__sentry_original__ = fn;
        return wrapped;
    }
    /**
     * Wraps addEventListener to capture UI breadcrumbs
     * @param eventName the event name (e.g. "click")
     * @returns wrapped breadcrumb events handler
     */
    function breadcrumbEventHandler(eventName) {
        return function (event) {
            // reset keypress timeout; e.g. triggering a 'click' after
            // a 'keypress' will reset the keypress debounce so that a new
            // set of keypresses can be recorded
            keypressTimeout = undefined;
            // It's possible this handler might trigger multiple times for the same
            // event (e.g. event propagation through node ancestors). Ignore if we've
            // already captured the event.
            if (lastCapturedEvent === event) {
                return;
            }
            lastCapturedEvent = event;
            // try/catch both:
            // - accessing event.target (see getsentry/raven-js#838, #768)
            // - `htmlTreeAsString` because it's complex, and just accessing the DOM incorrectly
            //   can throw an exception in some circumstances.
            var target;
            try {
                target = htmlTreeAsString(event.target);
            }
            catch (e) {
                target = '<unknown>';
            }
            getCurrentHub().addBreadcrumb({
                category: "ui." + eventName,
                message: target,
            }, {
                event: event,
                name: eventName,
            });
        };
    }
    /**
     * Wraps addEventListener to capture keypress UI events
     * @returns wrapped keypress events handler
     */
    function keypressEventHandler() {
        // TODO: if somehow user switches keypress target before
        //       debounce timeout is triggered, we will only capture
        //       a single breadcrumb from the FIRST target (acceptable?)
        return function (event) {
            var target;
            try {
                target = event.target;
            }
            catch (e) {
                // just accessing event properties can throw an exception in some rare circumstances
                // see: https://github.com/getsentry/raven-js/issues/838
                return;
            }
            var tagName = target && target.tagName;
            // only consider keypress events on actual input elements
            // this will disregard keypresses targeting body (e.g. tabbing
            // through elements, hotkeys, etc)
            if (!tagName || (tagName !== 'INPUT' && tagName !== 'TEXTAREA' && !target.isContentEditable)) {
                return;
            }
            // record first keypress in a series, but ignore subsequent
            // keypresses until debounce clears
            if (!keypressTimeout) {
                breadcrumbEventHandler('input')(event);
            }
            clearTimeout(keypressTimeout);
            keypressTimeout = setTimeout(function () {
                keypressTimeout = undefined;
            }, debounceDuration);
        };
    }

    /** Global handlers */
    var GlobalHandlers = /** @class */ (function () {
        /** JSDoc */
        function GlobalHandlers(options) {
            /**
             * @inheritDoc
             */
            this.name = GlobalHandlers.id;
            this.options = __assign({ onerror: true, onunhandledrejection: true }, options);
        }
        /**
         * @inheritDoc
         */
        GlobalHandlers.prototype.setupOnce = function () {
            subscribe(function (stack, _, error) {
                // TODO: use stack.context to get a valuable information from TraceKit, eg.
                // [
                //   0: "  })"
                //   1: ""
                //   2: "  function foo () {"
                //   3: "    Sentry.captureException('some error')"
                //   4: "    Sentry.captureMessage('some message')"
                //   5: "    throw 'foo'"
                //   6: "  }"
                //   7: ""
                //   8: "  function bar () {"
                //   9: "    foo();"
                //   10: "  }"
                // ]
                if (shouldIgnoreOnError()) {
                    return;
                }
                var self = getCurrentHub().getIntegration(GlobalHandlers);
                if (self) {
                    getCurrentHub().captureEvent(self.eventFromGlobalHandler(stack), { originalException: error, data: { stack: stack } });
                }
            });
            if (this.options.onerror) {
                logger.log('Global Handler attached: onerror');
                installGlobalHandler();
            }
            if (this.options.onunhandledrejection) {
                logger.log('Global Handler attached: onunhandledrejection');
                installGlobalUnhandledRejectionHandler();
            }
        };
        /** JSDoc */
        GlobalHandlers.prototype.eventFromGlobalHandler = function (stacktrace) {
            var event = eventFromStacktrace(stacktrace);
            return __assign({}, event, { exception: __assign({}, event.exception, { mechanism: {
                        data: {
                            mode: stacktrace.mode,
                        },
                        handled: false,
                        type: stacktrace.mechanism,
                    } }) });
        };
        /**
         * @inheritDoc
         */
        GlobalHandlers.id = 'GlobalHandlers';
        return GlobalHandlers;
    }());

    /** Wrap timer functions and event targets to catch errors and provide better meta data */
    var TryCatch = /** @class */ (function () {
        function TryCatch() {
            /** JSDoc */
            this.ignoreOnError = 0;
            /**
             * @inheritDoc
             */
            this.name = TryCatch.id;
        }
        /** JSDoc */
        TryCatch.prototype.wrapTimeFunction = function (original) {
            return function () {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                var originalCallback = args[0];
                args[0] = wrap(originalCallback, {
                    mechanism: {
                        data: { function: original.name || '<anonymous>' },
                        handled: true,
                        type: 'instrument',
                    },
                });
                return original.apply(this, args);
            };
        };
        /** JSDoc */
        TryCatch.prototype.wrapRAF = function (original) {
            return function (callback) {
                return original(wrap(callback, {
                    mechanism: {
                        data: {
                            function: 'requestAnimationFrame',
                            handler: (original && original.name) || '<anonymous>',
                        },
                        handled: true,
                        type: 'instrument',
                    },
                }));
            };
        };
        /** JSDoc */
        TryCatch.prototype.wrapEventTarget = function (target) {
            var global = getGlobalObject();
            var proto = global[target] && global[target].prototype;
            if (!proto || !proto.hasOwnProperty || !proto.hasOwnProperty('addEventListener')) {
                return;
            }
            fill(proto, 'addEventListener', function (original) {
                return function (eventName, fn, options) {
                    try {
                        fn.handleEvent = wrap(fn.handleEvent.bind(fn), {
                            mechanism: {
                                data: {
                                    function: 'handleEvent',
                                    handler: (fn && fn.name) || '<anonymous>',
                                    target: target,
                                },
                                handled: true,
                                type: 'instrument',
                            },
                        });
                    }
                    catch (err) {
                        // can sometimes get 'Permission denied to access property "handle Event'
                    }
                    // More breadcrumb DOM capture ... done here and not in `_instrumentBreadcrumbs`
                    // so that we don't have more than one wrapper function
                    var before;
                    var clickHandler;
                    var keypressHandler;
                    if (target === 'EventTarget' || target === 'Node') {
                        // NOTE: generating multiple handlers per addEventListener invocation, should
                        //       revisit and verify we can just use one (almost certainly)
                        clickHandler = breadcrumbEventHandler('click');
                        keypressHandler = keypressEventHandler();
                        before = function (event) {
                            // need to intercept every DOM event in `before` argument, in case that
                            // same wrapped method is re-used for different events (e.g. mousemove THEN click)
                            // see #724
                            if (!event) {
                                return;
                            }
                            var eventType;
                            try {
                                eventType = event.type;
                            }
                            catch (e) {
                                // just accessing event properties can throw an exception in some rare circumstances
                                // see: https://github.com/getsentry/raven-js/issues/838
                                return;
                            }
                            if (eventType === 'click') {
                                return clickHandler(event);
                            }
                            else if (eventType === 'keypress') {
                                return keypressHandler(event);
                            }
                        };
                    }
                    return original.call(this, eventName, wrap(fn, {
                        mechanism: {
                            data: {
                                function: 'addEventListener',
                                handler: (fn && fn.name) || '<anonymous>',
                                target: target,
                            },
                            handled: true,
                            type: 'instrument',
                        },
                    }, before), options);
                };
            });
            fill(proto, 'removeEventListener', function (original) {
                return function (eventName, fn, options) {
                    var callback = fn;
                    try {
                        callback = callback && (callback.__sentry_wrapped__ || callback);
                    }
                    catch (e) {
                        // ignore, accessing __sentry_wrapped__ will throw in some Selenium environments
                    }
                    return original.call(this, eventName, callback, options);
                };
            });
        };
        /**
         * Wrap timer functions and event targets to catch errors
         * and provide better metadata.
         */
        TryCatch.prototype.setupOnce = function () {
            this.ignoreOnError = this.ignoreOnError;
            var global = getGlobalObject();
            fill(global, 'setTimeout', this.wrapTimeFunction.bind(this));
            fill(global, 'setInterval', this.wrapTimeFunction.bind(this));
            fill(global, 'requestAnimationFrame', this.wrapRAF.bind(this));
            [
                'EventTarget',
                'Window',
                'Node',
                'ApplicationCache',
                'AudioTrackList',
                'ChannelMergerNode',
                'CryptoOperation',
                'EventSource',
                'FileReader',
                'HTMLUnknownElement',
                'IDBDatabase',
                'IDBRequest',
                'IDBTransaction',
                'KeyOperation',
                'MediaController',
                'MessagePort',
                'ModalWindow',
                'Notification',
                'SVGElementInstance',
                'Screen',
                'TextTrack',
                'TextTrackCue',
                'TextTrackList',
                'WebSocket',
                'WebSocketWorker',
                'Worker',
                'XMLHttpRequest',
                'XMLHttpRequestEventTarget',
                'XMLHttpRequestUpload',
            ].forEach(this.wrapEventTarget.bind(this));
        };
        /**
         * @inheritDoc
         */
        TryCatch.id = 'TryCatch';
        return TryCatch;
    }());

    var global$4 = getGlobalObject();
    var lastHref;
    /** Default Breadcrumbs instrumentations */
    var Breadcrumbs = /** @class */ (function () {
        /**
         * @inheritDoc
         */
        function Breadcrumbs(options) {
            /**
             * @inheritDoc
             */
            this.name = Breadcrumbs.id;
            this.options = __assign({ beacon: true, console: true, dom: true, fetch: true, history: true, sentry: true, xhr: true }, options);
        }
        /** JSDoc */
        Breadcrumbs.prototype.instrumentBeacon = function () {
            if (!supportsBeacon()) {
                return;
            }
            /** JSDoc */
            function beaconReplacementFunction(originalBeaconFunction) {
                return function () {
                    var args = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        args[_i] = arguments[_i];
                    }
                    var url = args[0];
                    var data = args[1];
                    // If the browser successfully queues the request for delivery, the method returns "true" and returns "false" otherwise.
                    // https://developer.mozilla.org/en-US/docs/Web/API/Beacon_API/Using_the_Beacon_API
                    var result = originalBeaconFunction.apply(this, args);
                    var client = getCurrentHub().getClient();
                    var dsn = client && client.getDsn();
                    if (dsn) {
                        var filterUrl = new API(dsn).getStoreEndpoint();
                        // if Sentry key appears in URL, don't capture it as a request
                        // but rather as our own 'sentry' type breadcrumb
                        if (filterUrl && includes(url, filterUrl)) {
                            addSentryBreadcrumb(data);
                            return result;
                        }
                    }
                    // What is wrong with you TypeScript...
                    var breadcrumbData = {
                        category: 'beacon',
                        data: data,
                        type: 'http',
                    };
                    if (!result) {
                        breadcrumbData.level = exports.Severity.Error;
                    }
                    Breadcrumbs.addBreadcrumb(breadcrumbData, {
                        input: args,
                        result: result,
                    });
                    return result;
                };
            }
            fill(global$4.navigator, 'sendBeacon', beaconReplacementFunction);
        };
        /** JSDoc */
        Breadcrumbs.prototype.instrumentConsole = function () {
            if (!('console' in global$4)) {
                return;
            }
            ['debug', 'info', 'warn', 'error', 'log'].forEach(function (level) {
                if (!(level in global$4.console)) {
                    return;
                }
                fill(global$4.console, level, function (originalConsoleLevel) {
                    return function () {
                        var args = [];
                        for (var _i = 0; _i < arguments.length; _i++) {
                            args[_i] = arguments[_i];
                        }
                        var breadcrumbData = {
                            category: 'console',
                            data: {
                                extra: {
                                    arguments: serializeObject(args, 2),
                                },
                                logger: 'console',
                            },
                            level: exports.Severity.fromString(level),
                            message: safeJoin(args, ' '),
                        };
                        if (level === 'assert') {
                            if (args[0] === false) {
                                breadcrumbData.message = "Assertion failed: " + (safeJoin(args.slice(1), ' ') || 'console.assert');
                                breadcrumbData.data.extra.arguments = serializeObject(args.slice(1), 2);
                            }
                        }
                        Breadcrumbs.addBreadcrumb(breadcrumbData, {
                            input: args,
                            level: level,
                        });
                        // this fails for some browsers. :(
                        if (originalConsoleLevel) {
                            Function.prototype.apply.call(originalConsoleLevel, global$4.console, args);
                        }
                    };
                });
            });
        };
        /** JSDoc */
        Breadcrumbs.prototype.instrumentDOM = function () {
            if (!('document' in global$4)) {
                return;
            }
            // Capture breadcrumbs from any click that is unhandled / bubbled up all the way
            // to the document. Do this before we instrument addEventListener.
            global$4.document.addEventListener('click', breadcrumbEventHandler('click'), false);
            global$4.document.addEventListener('keypress', keypressEventHandler(), false);
        };
        /** JSDoc */
        Breadcrumbs.prototype.instrumentFetch = function () {
            if (!supportsNativeFetch()) {
                return;
            }
            fill(global$4, 'fetch', function (originalFetch) {
                return function () {
                    var args = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        args[_i] = arguments[_i];
                    }
                    var fetchInput = args[0];
                    var method = 'GET';
                    var url;
                    if (typeof fetchInput === 'string') {
                        url = fetchInput;
                    }
                    else if ('Request' in global$4 && fetchInput instanceof Request) {
                        url = fetchInput.url;
                        if (fetchInput.method) {
                            method = fetchInput.method;
                        }
                    }
                    else {
                        url = String(fetchInput);
                    }
                    if (args[1] && args[1].method) {
                        method = args[1].method;
                    }
                    var client = getCurrentHub().getClient();
                    var dsn = client && client.getDsn();
                    if (dsn) {
                        var filterUrl = new API(dsn).getStoreEndpoint();
                        // if Sentry key appears in URL, don't capture it as a request
                        // but rather as our own 'sentry' type breadcrumb
                        if (filterUrl && includes(url, filterUrl)) {
                            if (method === 'POST' && args[1] && args[1].body) {
                                addSentryBreadcrumb(args[1].body);
                            }
                            return originalFetch.apply(global$4, args);
                        }
                    }
                    var fetchData = {
                        method: method,
                        url: url,
                    };
                    return originalFetch
                        .apply(global$4, args)
                        .then(function (response) {
                        fetchData.status_code = response.status;
                        Breadcrumbs.addBreadcrumb({
                            category: 'fetch',
                            data: fetchData,
                            type: 'http',
                        }, {
                            input: args,
                            response: response,
                        });
                        return response;
                    })
                        .catch(function (error) {
                        Breadcrumbs.addBreadcrumb({
                            category: 'fetch',
                            data: fetchData,
                            level: exports.Severity.Error,
                            type: 'http',
                        }, {
                            error: error,
                            input: args,
                        });
                        throw error;
                    });
                };
            });
        };
        /** JSDoc */
        Breadcrumbs.prototype.instrumentHistory = function () {
            var _this = this;
            if (!supportsHistory()) {
                return;
            }
            var captureUrlChange = function (from, to) {
                var parsedLoc = parseUrl(global$4.location.href);
                var parsedTo = parseUrl(to);
                var parsedFrom = parseUrl(from);
                // Initial pushState doesn't provide `from` information
                if (!parsedFrom.path) {
                    parsedFrom = parsedLoc;
                }
                // because onpopstate only tells you the "new" (to) value of location.href, and
                // not the previous (from) value, we need to track the value of the current URL
                // state ourselves
                lastHref = to;
                // Use only the path component of the URL if the URL matches the current
                // document (almost all the time when using pushState)
                if (parsedLoc.protocol === parsedTo.protocol && parsedLoc.host === parsedTo.host) {
                    // tslint:disable-next-line:no-parameter-reassignment
                    to = parsedTo.relative;
                }
                if (parsedLoc.protocol === parsedFrom.protocol && parsedLoc.host === parsedFrom.host) {
                    // tslint:disable-next-line:no-parameter-reassignment
                    from = parsedFrom.relative;
                }
                Breadcrumbs.addBreadcrumb({
                    category: 'navigation',
                    data: {
                        from: from,
                        to: to,
                    },
                });
            };
            // record navigation (URL) changes
            var oldOnPopState = global$4.onpopstate;
            global$4.onpopstate = function () {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                var currentHref = global$4.location.href;
                captureUrlChange(lastHref, currentHref);
                if (oldOnPopState) {
                    return oldOnPopState.apply(_this, args);
                }
            };
            /** JSDoc */
            function historyReplacementFunction(originalHistoryFunction) {
                // note history.pushState.length is 0; intentionally not declaring
                // params to preserve 0 arity
                return function () {
                    var args = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        args[_i] = arguments[_i];
                    }
                    var url = args.length > 2 ? args[2] : undefined;
                    // url argument is optional
                    if (url) {
                        // coerce to string (this is what pushState does)
                        captureUrlChange(lastHref, String(url));
                    }
                    return originalHistoryFunction.apply(this, args);
                };
            }
            fill(global$4.history, 'pushState', historyReplacementFunction);
            fill(global$4.history, 'replaceState', historyReplacementFunction);
        };
        /** JSDoc */
        Breadcrumbs.prototype.instrumentXHR = function () {
            if (!('XMLHttpRequest' in global$4)) {
                return;
            }
            /** JSDoc */
            function wrapProp(prop, xhr) {
                // TODO: Fix XHR types
                if (prop in xhr && isFunction(xhr[prop])) {
                    fill(xhr, prop, function (original) {
                        return wrap(original, {
                            mechanism: {
                                data: {
                                    function: prop,
                                    handler: (original && original.name) || '<anonymous>',
                                },
                                handled: true,
                                type: 'instrument',
                            },
                        });
                    });
                }
            }
            var xhrproto = XMLHttpRequest.prototype;
            fill(xhrproto, 'open', function (originalOpen) {
                return function () {
                    var args = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        args[_i] = arguments[_i];
                    }
                    var url = args[1];
                    this.__sentry_xhr__ = {
                        method: args[0],
                        url: args[1],
                    };
                    var client = getCurrentHub().getClient();
                    var dsn = client && client.getDsn();
                    if (dsn) {
                        var filterUrl = new API(dsn).getStoreEndpoint();
                        // if Sentry key appears in URL, don't capture it as a request
                        // but rather as our own 'sentry' type breadcrumb
                        if (isString(url) && (filterUrl && includes(url, filterUrl))) {
                            this.__sentry_own_request__ = true;
                        }
                    }
                    return originalOpen.apply(this, args);
                };
            });
            fill(xhrproto, 'send', function (originalSend) {
                return function () {
                    var args = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        args[_i] = arguments[_i];
                    }
                    var xhr = this; // tslint:disable-line:no-this-assignment
                    if (xhr.__sentry_own_request__) {
                        addSentryBreadcrumb(args[0]);
                    }
                    /** JSDoc */
                    function onreadystatechangeHandler() {
                        if (xhr.readyState === 4) {
                            if (xhr.__sentry_own_request__) {
                                return;
                            }
                            try {
                                // touching statusCode in some platforms throws
                                // an exception
                                if (xhr.__sentry_xhr__) {
                                    xhr.__sentry_xhr__.status_code = xhr.status;
                                }
                            }
                            catch (e) {
                                /* do nothing */
                            }
                            Breadcrumbs.addBreadcrumb({
                                category: 'xhr',
                                data: xhr.__sentry_xhr__,
                                type: 'http',
                            }, {
                                xhr: xhr,
                            });
                        }
                    }
                    ['onload', 'onerror', 'onprogress'].forEach(function (prop) {
                        wrapProp(prop, xhr);
                    });
                    if ('onreadystatechange' in xhr && isFunction(xhr.onreadystatechange)) {
                        fill(xhr, 'onreadystatechange', function (original) {
                            return wrap(original, {
                                mechanism: {
                                    data: {
                                        function: 'onreadystatechange',
                                        handler: (original && original.name) || '<anonymous>',
                                    },
                                    handled: true,
                                    type: 'instrument',
                                },
                            }, onreadystatechangeHandler);
                        });
                    }
                    else {
                        // if onreadystatechange wasn't actually set by the page on this xhr, we
                        // are free to set our own and capture the breadcrumb
                        xhr.onreadystatechange = onreadystatechangeHandler;
                    }
                    return originalSend.apply(this, args);
                };
            });
        };
        /**
         * Helper that checks if integration is enabled on the client.
         * @param breadcrumb Breadcrumb
         * @param hint SentryBreadcrumbHint
         */
        Breadcrumbs.addBreadcrumb = function (breadcrumb, hint) {
            if (getCurrentHub().getIntegration(Breadcrumbs)) {
                getCurrentHub().addBreadcrumb(breadcrumb, hint);
            }
        };
        /**
         * Instrument browser built-ins w/ breadcrumb capturing
         *  - Console API
         *  - DOM API (click/typing)
         *  - XMLHttpRequest API
         *  - Fetch API
         *  - History API
         */
        Breadcrumbs.prototype.setupOnce = function () {
            if (this.options.console) {
                this.instrumentConsole();
            }
            if (this.options.dom) {
                this.instrumentDOM();
            }
            if (this.options.xhr) {
                this.instrumentXHR();
            }
            if (this.options.fetch) {
                this.instrumentFetch();
            }
            if (this.options.beacon) {
                this.instrumentBeacon();
            }
            if (this.options.history) {
                this.instrumentHistory();
            }
        };
        /**
         * @inheritDoc
         */
        Breadcrumbs.id = 'Breadcrumbs';
        return Breadcrumbs;
    }());
    /** JSDoc */
    function addSentryBreadcrumb(serializedData) {
        // There's always something that can go wrong with deserialization...
        try {
            var event_1 = deserialize(serializedData);
            Breadcrumbs.addBreadcrumb({
                category: 'sentry',
                event_id: event_1.event_id,
                level: event_1.level || exports.Severity.fromString('error'),
                message: getEventDescription(event_1),
            }, {
                event: event_1,
            });
        }
        catch (_oO) {
            logger.error('Error while adding sentry type breadcrumb');
        }
    }

    var DEFAULT_KEY = 'cause';
    var DEFAULT_LIMIT = 5;
    /** Adds SDK info to an event. */
    var LinkedErrors = /** @class */ (function () {
        /**
         * @inheritDoc
         */
        function LinkedErrors(options) {
            if (options === void 0) { options = {}; }
            /**
             * @inheritDoc
             */
            this.name = LinkedErrors.id;
            this.key = options.key || DEFAULT_KEY;
            this.limit = options.limit || DEFAULT_LIMIT;
        }
        /**
         * @inheritDoc
         */
        LinkedErrors.prototype.setupOnce = function () {
            var _this = this;
            addGlobalEventProcessor(function (event, hint) { return __awaiter(_this, void 0, void 0, function () {
                var self;
                return __generator(this, function (_a) {
                    self = getCurrentHub().getIntegration(LinkedErrors);
                    if (self) {
                        return [2 /*return*/, self.handler(event, hint)];
                    }
                    return [2 /*return*/, event];
                });
            }); });
        };
        /**
         * @inheritDoc
         */
        LinkedErrors.prototype.handler = function (event, hint) {
            if (!event.exception || !event.exception.values || !hint || !(hint.originalException instanceof Error)) {
                return event;
            }
            var linkedErrors = this.walkErrorTree(hint.originalException, this.key);
            event.exception.values = __spread(linkedErrors, event.exception.values);
            return event;
        };
        /**
         * @inheritDoc
         */
        LinkedErrors.prototype.walkErrorTree = function (error, key, stack) {
            if (stack === void 0) { stack = []; }
            if (!(error[key] instanceof Error) || stack.length + 1 >= this.limit) {
                return stack;
            }
            var stacktrace = computeStackTrace(error[key]);
            var exception = exceptionFromStacktrace(stacktrace);
            return this.walkErrorTree(error[key], key, __spread([exception], stack));
        };
        /**
         * @inheritDoc
         */
        LinkedErrors.id = 'LinkedErrors';
        return LinkedErrors;
    }());

    var global$5 = getGlobalObject();
    /** UserAgent */
    var UserAgent = /** @class */ (function () {
        function UserAgent() {
            /**
             * @inheritDoc
             */
            this.name = UserAgent.id;
        }
        /**
         * @inheritDoc
         */
        UserAgent.prototype.setupOnce = function () {
            var _this = this;
            addGlobalEventProcessor(function (event) { return __awaiter(_this, void 0, void 0, function () {
                var request;
                return __generator(this, function (_a) {
                    if (getCurrentHub().getIntegration(UserAgent)) {
                        if (!global$5.navigator || !global$5.location) {
                            return [2 /*return*/, event];
                        }
                        request = event.request || {};
                        request.url = request.url || global$5.location.href;
                        request.headers = request.headers || {};
                        request.headers['User-Agent'] = global$5.navigator.userAgent;
                        return [2 /*return*/, __assign({}, event, { request: request })];
                    }
                    return [2 /*return*/, event];
                });
            }); });
        };
        /**
         * @inheritDoc
         */
        UserAgent.id = 'UserAgent';
        return UserAgent;
    }());

    /** JSDoc */
    var Ember = /** @class */ (function () {
        /**
         * @inheritDoc
         */
        function Ember(options) {
            if (options === void 0) { options = {}; }
            /**
             * @inheritDoc
             */
            this.name = Ember.id;
            this.Ember =
                options.Ember ||
                    getGlobalObject().Ember;
        }
        /**
         * @inheritDoc
         */
        Ember.prototype.setupOnce = function () {
            var _this = this;
            if (!this.Ember) {
                return;
            }
            var oldOnError = this.Ember.onerror;
            this.Ember.onerror = function (error) {
                if (getCurrentHub().getIntegration(Ember)) {
                    withScope(function (scope) {
                        _this.addIntegrationToSdkInfo(scope);
                        getCurrentHub().captureException(error, { originalException: error });
                    });
                }
                if (typeof oldOnError === 'function') {
                    oldOnError.call(_this.Ember, error);
                }
                else if (_this.Ember.testing) {
                    throw error;
                }
            };
            this.Ember.RSVP.on('error', function (reason) {
                if (getCurrentHub().getIntegration(Ember)) {
                    withScope(function (scope) {
                        if (reason instanceof Error) {
                            scope.setExtra('context', 'Unhandled Promise error detected');
                            _this.addIntegrationToSdkInfo(scope);
                            getCurrentHub().captureException(reason, { originalException: reason });
                        }
                        else {
                            scope.setExtra('reason', reason);
                            _this.addIntegrationToSdkInfo(scope);
                            captureMessage('Unhandled Promise error detected');
                        }
                    });
                }
            });
        };
        /**
         * Appends SDK integrations
         * @param scope The scope currently used.
         */
        Ember.prototype.addIntegrationToSdkInfo = function (scope) {
            var _this = this;
            scope.addEventProcessor(function (event) { return __awaiter(_this, void 0, void 0, function () {
                var integrations;
                return __generator(this, function (_a) {
                    if (event.sdk) {
                        integrations = event.sdk.integrations || [];
                        event.sdk = __assign({}, event.sdk, { integrations: __spread(integrations, ['ember']) });
                    }
                    return [2 /*return*/, event];
                });
            }); });
        };
        /**
         * @inheritDoc
         */
        Ember.id = 'Ember';
        return Ember;
    }());

    /** JSDoc */
    var Vue = /** @class */ (function () {
        /**
         * @inheritDoc
         */
        function Vue(options) {
            if (options === void 0) { options = {}; }
            /**
             * @inheritDoc
             */
            this.name = Vue.id;
            this.Vue =
                options.Vue ||
                    getGlobalObject().Vue;
        }
        /** JSDoc */
        Vue.prototype.formatComponentName = function (vm) {
            if (vm.$root === vm) {
                return 'root instance';
            }
            var name = vm._isVue ? vm.$options.name || vm.$options._componentTag : vm.name;
            return ((name ? "component <" + name + ">" : 'anonymous component') +
                (vm._isVue && vm.$options.__file ? " at " + vm.$options.__file : ''));
        };
        /**
         * @inheritDoc
         */
        Vue.prototype.setupOnce = function () {
            var _this = this;
            if (!this.Vue || !this.Vue.config) {
                return;
            }
            var oldOnError = this.Vue.config.errorHandler;
            this.Vue.config.errorHandler = function (error, vm, info) {
                var metadata = {};
                if (isPlainObject(vm)) {
                    metadata.componentName = _this.formatComponentName(vm);
                    metadata.propsData = vm.$options.propsData;
                }
                if (!isUndefined(info)) {
                    metadata.lifecycleHook = info;
                }
                if (getCurrentHub().getIntegration(Vue)) {
                    withScope(function (scope) {
                        Object.keys(metadata).forEach(function (key) {
                            scope.setExtra(key, metadata[key]);
                        });
                        scope.addEventProcessor(function (event) { return __awaiter(_this, void 0, void 0, function () {
                            var integrations;
                            return __generator(this, function (_a) {
                                if (event.sdk) {
                                    integrations = event.sdk.integrations || [];
                                    event.sdk = __assign({}, event.sdk, { integrations: __spread(integrations, ['vue']) });
                                }
                                return [2 /*return*/, event];
                            });
                        }); });
                        getCurrentHub().captureException(error, { originalException: error });
                    });
                }
                if (typeof oldOnError === 'function') {
                    oldOnError.call(_this.Vue, error, vm, info);
                }
            };
        };
        /**
         * @inheritDoc
         */
        Vue.id = 'Vue';
        return Vue;
    }());

    /** JSDoc */
    var ReportTypes;
    (function (ReportTypes) {
        /** JSDoc */
        ReportTypes["Crash"] = "crash";
        /** JSDoc */
        ReportTypes["Deprecation"] = "deprecation";
        /** JSDoc */
        ReportTypes["Intervention"] = "intervention";
    })(ReportTypes || (ReportTypes = {}));
    /** Reporting API integration - https://w3c.github.io/reporting/ */
    var ReportingObserver = /** @class */ (function () {
        /**
         * @inheritDoc
         */
        function ReportingObserver(options) {
            if (options === void 0) { options = {
                types: [ReportTypes.Crash, ReportTypes.Deprecation, ReportTypes.Intervention],
            }; }
            this.options = options;
            /**
             * @inheritDoc
             */
            this.name = ReportingObserver.id;
        }
        /**
         * @inheritDoc
         */
        ReportingObserver.prototype.setupOnce = function () {
            if (!supportsReportingObserver()) {
                return;
            }
            var observer = new (getGlobalObject().ReportingObserver)(this.handler.bind(this), {
                buffered: true,
                types: this.options.types,
            });
            observer.observe();
        };
        /**
         * @inheritDoc
         */
        ReportingObserver.prototype.handler = function (reports) {
            var e_1, _a;
            if (!getCurrentHub().getIntegration(ReportingObserver)) {
                return;
            }
            var _loop_1 = function (report) {
                withScope(function (scope) {
                    scope.setExtra('url', report.url);
                    var label = "ReportingObserver [" + report.type + "]";
                    var details = 'No details available';
                    if (report.body) {
                        // Object.keys doesn't work on ReportBody, as all properties are inheirted
                        var plainBody = {};
                        // tslint:disable-next-line:forin
                        for (var prop in report.body) {
                            plainBody[prop] = report.body[prop];
                        }
                        scope.setExtra('body', plainBody);
                        if (report.type === ReportTypes.Crash) {
                            var body = report.body;
                            // A fancy way to create a message out of crashId OR reason OR both OR fallback
                            details = [body.crashId || '', body.reason || ''].join(' ').trim() || details;
                        }
                        else {
                            var body = report.body;
                            details = body.message || details;
                        }
                    }
                    captureMessage(label + ": " + details);
                });
            };
            try {
                for (var reports_1 = __values(reports), reports_1_1 = reports_1.next(); !reports_1_1.done; reports_1_1 = reports_1.next()) {
                    var report = reports_1_1.value;
                    _loop_1(report);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (reports_1_1 && !reports_1_1.done && (_a = reports_1.return)) _a.call(reports_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
        };
        /**
         * @inheritDoc
         */
        ReportingObserver.id = 'ReportingObserver';
        return ReportingObserver;
    }());



    var BrowserIntegrations = /*#__PURE__*/Object.freeze({
        GlobalHandlers: GlobalHandlers,
        TryCatch: TryCatch,
        Breadcrumbs: Breadcrumbs,
        LinkedErrors: LinkedErrors,
        UserAgent: UserAgent,
        Ember: Ember,
        Vue: Vue,
        ReportingObserver: ReportingObserver
    });

    var defaultIntegrations = [
        // Common
        new Dedupe(),
        new InboundFilters(),
        new FunctionToString(),
        // Native Wrappers
        new TryCatch(),
        new Breadcrumbs(),
        // Global Handlers
        new GlobalHandlers(),
        // Misc
        new LinkedErrors(),
        new UserAgent(),
    ];
    /**
     * The Sentry Browser SDK Client.
     *
     * To use this SDK, call the {@link init} function as early as possible when
     * loading the web page. To set context information or send manual events, use
     * the provided methods.
     *
     * @example
     * import { init } from '@sentry/browser';
     *
     * init({
     *   dsn: '__DSN__',
     *   // ...
     * });
     *
     * @example
     * import { configureScope } from '@sentry/browser';
     * configureScope((scope: Scope) => {
     *   scope.setExtra({ battery: 0.7 });
     *   scope.setTag({ user_mode: 'admin' });
     *   scope.setUser({ id: '4711' });
     * });
     *
     * @example
     * import { addBreadcrumb } from '@sentry/browser';
     * addBreadcrumb({
     *   message: 'My Breadcrumb',
     *   // ...
     * });
     *
     * @example
     * import * as Sentry from '@sentry/browser';
     * Sentry.captureMessage('Hello, world!');
     * Sentry.captureException(new Error('Good bye'));
     * Sentry.captureEvent({
     *   message: 'Manual',
     *   stacktrace: [
     *     // ...
     *   ],
     * });
     *
     * @see BrowserOptions for documentation on configuration options.
     */
    function init(options) {
        if (options === void 0) { options = {}; }
        if (options.defaultIntegrations === undefined) {
            options.defaultIntegrations = defaultIntegrations;
        }
        initAndBind(BrowserClient, options);
    }
    /**
     * Present the user with a report dialog.
     *
     * @param options Everything is optional, we try to fetch all info need from the global scope.
     */
    function showReportDialog(options) {
        if (options === void 0) { options = {}; }
        if (!options.eventId) {
            options.eventId = getCurrentHub().lastEventId();
        }
        getCurrentHub().getClient().showReportDialog(options);
    }
    /**
     * This is the getter for lastEventId.
     *
     * @returns The last event id of a captured event.
     */
    function lastEventId() {
        return getCurrentHub().lastEventId();
    }
    /**
     * This function is here to be API compatible with the loader
     */
    function forceLoad() {
        // Noop
    }
    /**
     * This function is here to be API compatible with the loader
     */
    function onLoad(callback) {
        callback();
    }

    var INTEGRATIONS = __assign({}, CoreIntegrations, BrowserIntegrations);

    exports.Integrations = INTEGRATIONS;
    exports.Transports = index;
    exports.addGlobalEventProcessor = addGlobalEventProcessor;
    exports.addBreadcrumb = addBreadcrumb;
    exports.captureException = captureException;
    exports.captureEvent = captureEvent;
    exports.captureMessage = captureMessage;
    exports.configureScope = configureScope;
    exports.withScope = withScope;
    exports.getHubFromCarrier = getHubFromCarrier;
    exports.getCurrentHub = getCurrentHub;
    exports.Hub = Hub;
    exports.Scope = Scope;
    exports.BrowserBackend = BrowserBackend;
    exports.BrowserClient = BrowserClient;
    exports.defaultIntegrations = defaultIntegrations;
    exports.forceLoad = forceLoad;
    exports.init = init;
    exports.lastEventId = lastEventId;
    exports.onLoad = onLoad;
    exports.showReportDialog = showReportDialog;
    exports.SDK_NAME = SDK_NAME;
    exports.SDK_VERSION = SDK_VERSION;

    return exports;

}({}));
//# sourceMappingURL=bundle.js.map
