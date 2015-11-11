/*global XDomainRequest:false*/
'use strict';

var TraceKit = require('../vendor/TraceKit/tracekit');
var RavenConfigError = require('./configError');
var utils = require('./utils');

var isFunction = utils.isFunction;
var isUndefined = utils.isUndefined;
var isError = utils.isError;
var isEmptyObject = utils.isEmptyObject;
var hasKey = utils.hasKey;
var joinRegExp = utils.joinRegExp;
var each = utils.each;
var objectMerge = utils.objectMerge;
var truncate = utils.truncate;
var urlencode = utils.urlencode;
var uuid4 = utils.uuid4;

// First, check for JSON support
// If there is no JSON, we no-op the core features of Raven
// since JSON is required to encode the payload
function Raven() {
    this.hasJSON = !!(typeof JSON === 'object' && JSON.stringify);
    // Raven can run in contexts where there's no document (react-native)
    this.hasDocument = typeof document !== 'undefined';
    this.lastCapturedException = null;
    this._lastEventId = null;
    this.globalServer = null;
    this.globalKey = null;
    this.globalProject = null;
    this.globalContext = {};
    this.globalOptions = {
        logger: 'javascript',
        ignoreErrors: [],
        ignoreUrls: [],
        whitelistUrls: [],
        includePaths: [],
        crossOrigin: 'anonymous',
        collectWindowErrors: true,
        maxMessageLength: 100
    };
    this.isRavenInstalled = false;
    // capture references to window.console *and* all its methods first
    // before the console plugin has a chance to monkey patch
    this.originalConsole = window.console || {};
    this.originalConsoleMethods = {};
    this.plugins = [];
    this.startTime = now();

    for (var method in this.originalConsole) {
      this.originalConsoleMethods[method] = this.originalConsole[method];
    }
}

/*
 * The core Raven singleton
 *
 * @this {Raven}
 */

Raven.prototype = {
    VERSION: '<%= pkg.version %>',

    TraceKit: TraceKit, // temporarily exported for tests

    debug: true,

    /*
     * Allow multiple versions of Raven to be installed.
     * Strip Raven from the global context and returns the instance.
     *
     * @return {Raven}
     */
    // noConflict: function() {
    //     window.Raven = _Raven;
    //     return this;
    // },

    /*
     * Configure Raven with a DSN and extra options
     *
     * @param {string} dsn The public Sentry DSN
     * @param {object} options Optional set of of global options [optional]
     * @return {Raven}
     */
    config: function(dsn, options) {
        var self = this;

        if (this.globalServer) {
                this._logDebug('error', 'Error: Raven has already been configured');
            return this;
        }
        if (!dsn) return this;

        var uri = this._parseDSN(dsn),
            lastSlash = uri.path.lastIndexOf('/'),
            path = uri.path.substr(1, lastSlash);

        // merge in options
        if (options) {
            each(options, function(key, value){
                // tags and extra are special and need to be put into context
                if (key == 'tags' || key == 'extra') {
                    self.globalContext[key] = value;
                } else {
                    self.globalOptions[key] = value;
                }
            });
        }

        // "Script error." is hard coded into browsers for errors that it can't read.
        // this is the result of a script being pulled in from an external domain and CORS.
        this.globalOptions.ignoreErrors.push(/^Script error\.?$/);
        this.globalOptions.ignoreErrors.push(/^Javascript error: Script error\.? on line 0$/);

        // join regexp rules into one big rule
        this.globalOptions.ignoreErrors = joinRegExp(this.globalOptions.ignoreErrors);
        this.globalOptions.ignoreUrls = this.globalOptions.ignoreUrls.length ? joinRegExp(this.globalOptions.ignoreUrls) : false;
        this.globalOptions.whitelistUrls = this.globalOptions.whitelistUrls.length ? joinRegExp(this.globalOptions.whitelistUrls) : false;
        this.globalOptions.includePaths = joinRegExp(this.globalOptions.includePaths);

        this.globalKey = uri.user;
        this.globalProject = uri.path.substr(lastSlash + 1);

        // assemble the endpoint from the uri pieces
        this.globalServer = '//' + uri.host +
                      (uri.port ? ':' + uri.port : '') +
                      '/' + path + 'api/' + this.globalProject + '/store/';

        // can safely use protocol relative (//) if target host is
        // app.getsentry.com; otherwise use protocol from DSN
        if (uri.protocol && uri.host !== 'app.getsentry.com') {
            this.globalServer = uri.protocol + ':' + this.globalServer;
        }

        if (this.globalOptions.fetchContext) {
            TraceKit.remoteFetching = true;
        }

        if (this.globalOptions.linesOfContext) {
            TraceKit.linesOfContext = this.globalOptions.linesOfContext;
        }

        TraceKit.collectWindowErrors = !!this.globalOptions.collectWindowErrors;

        // return for chaining
        return this;
    },

    /*
     * Installs a global window.onerror error handler
     * to capture and report uncaught exceptions.
     * At this point, install() is required to be called due
     * to the way TraceKit is set up.
     *
     * @return {Raven}
     */
    install: function() {
        if (this.isSetup() && !this.isRavenInstalled) {
            TraceKit.report.subscribe(this._handleStackInfo);

            // Install all of the plugins
            each(this.plugins, function(_, plugin) {
                plugin();
            });

            this.isRavenInstalled = true;
        }

        return this;
    },

    /*
     * Wrap code within a context so Raven can capture errors
     * reliably across domains that is executed immediately.
     *
     * @param {object} options A specific set of options for this context [optional]
     * @param {function} func The callback to be immediately executed within the context
     * @param {array} args An array of arguments to be called with the callback [optional]
     */
    context: function(options, func, args) {
        if (isFunction(options)) {
            args = func || [];
            func = options;
            options = undefined;
        }

        return this.wrap(options, func).apply(this, args);
    },

    /*
     * Wrap code within a context and returns back a new function to be executed
     *
     * @param {object} options A specific set of options for this context [optional]
     * @param {function} func The function to be wrapped in a new context
     * @return {function} The newly wrapped functions with a context
     */
    wrap: function(options, func) {
        var self = this;

        // 1 argument has been passed, and it's not a function
        // so just return it
        if (isUndefined(func) && !isFunction(options)) {
            return options;
        }

        // options is optional
        if (isFunction(options)) {
            func = options;
            options = undefined;
        }

        // At this point, we've passed along 2 arguments, and the second one
        // is not a function either, so we'll just return the second argument.
        if (!isFunction(func)) {
            return func;
        }

        // We don't wanna wrap it twice!
        if (func.__raven__) {
            return func;
        }

        function wrapped() {
            var args = [], i = arguments.length,
                deep = !options || options && options.deep !== false;
            // Recursively wrap all of a function's arguments that are
            // functions themselves.

            while(i--) args[i] = deep ? self.wrap(options, arguments[i]) : arguments[i];

            try {
                /*jshint -W040*/
                return func.apply(this, args);
            } catch(e) {
                self.captureException(e, options);
                throw e;
            }
        }

        // copy over properties of the old function
        for (var property in func) {
            if (hasKey(func, property)) {
                wrapped[property] = func[property];
            }
        }
        wrapped.prototype = func.prototype;

        // Signal that this function has been wrapped already
        // for both debugging and to prevent it to being wrapped twice
        wrapped.__raven__ = true;
        wrapped.__inner__ = func;

        return wrapped;
    },

    /*
     * Uninstalls the global error handler.
     *
     * @return {Raven}
     */
    uninstall: function() {
        TraceKit.report.uninstall();
        this.isRavenInstalled = false;

        return this;
    },

    /*
     * Manually capture an exception and send it over to Sentry
     *
     * @param {error} ex An exception to be logged
     * @param {object} options A specific set of options for this error [optional]
     * @return {Raven}
     */
    captureException: function(ex, options) {
        // If not an Error is passed through, recall as a message instead
        if (!isError(ex)) return this.captureMessage(ex, options);

        // Store the raw exception object for potential debugging and introspection
        this.lastCapturedException = ex;

        // TraceKit.report will re-raise any exception passed to it,
        // which means you have to wrap it in try/catch. Instead, we
        // can wrap it here and only re-raise if TraceKit.report
        // raises an exception different from the one we asked to
        // report on.
        try {
            var stack = TraceKit.computeStackTrace(ex);
            this._handleStackInfo(stack, options);
        } catch(ex1) {
            if(ex !== ex1) {
                throw ex1;
            }
        }

        return this;
    },

    /*
     * Manually send a message to Sentry
     *
     * @param {string} msg A plain message to be captured in Sentry
     * @param {object} options A specific set of options for this message [optional]
     * @return {Raven}
     */
    captureMessage: function(msg, options) {
        // config() automagically converts ignoreErrors from a list to a RegExp so we need to test for an
        // early call; we'll error on the side of logging anything called before configuration since it's
        // probably something you should see:
        if (!!this.globalOptions.ignoreErrors.test && this.globalOptions.ignoreErrors.test(msg)) {
            return;
        }

        // Fire away!
        this._send(
            objectMerge({
                message: msg + ''  // Make sure it's actually a string
            }, options)
        );

        return this;
    },

    addPlugin: function(plugin /*arg1, arg2, ... argN*/) {
        this.plugins.push(plugin);
        if (this.isRavenInstalled) {
            plugin.install.apply(this, Array.prototype.slice.call(arguments, 1));
        }
        return this;
    },

    /*
     * Set/clear a user to be sent along with the payload.
     *
     * @param {object} user An object representing user data [optional]
     * @return {Raven}
     */
    setUserContext: function(user) {
        // Intentionally do not merge here since that's an unexpected behavior.
        this.globalContext.user = user;

        return this;
    },

    /*
     * Merge extra attributes to be sent along with the payload.
     *
     * @param {object} extra An object representing extra data [optional]
     * @return {Raven}
     */
    setExtraContext: function(extra) {
        this._mergeContext('extra', extra);

        return this;
    },

    /*
     * Merge tags to be sent along with the payload.
     *
     * @param {object} tags An object representing tags [optional]
     * @return {Raven}
     */
    setTagsContext: function(tags) {
        this._mergeContext('tags', tags);

        return this;
    },

    /*
     * Clear all of the context.
     *
     * @return {Raven}
     */
    clearContext: function() {
        this.globalContext = {};

        return this;
    },

    /*
     * Get a copy of the current context. This cannot be mutated.
     *
     * @return {object} copy of context
     */
    getContext: function() {
        // lol javascript
        return JSON.parse(JSON.stringify(this.globalContext));
    },

    /*
     * Set release version of application
     *
     * @param {string} release Typically something like a git SHA to identify version
     * @return {Raven}
     */
    setRelease: function(release) {
        this.globalOptions.release = release;

        return this;
    },

    /*
     * Set the dataCallback option
     *
     * @param {function} callback The callback to run which allows the
     *                            data blob to be mutated before sending
     * @return {Raven}
     */
    setDataCallback: function(callback) {
        this.globalOptions.dataCallback = callback;

        return this;
    },

    /*
     * Set the shouldSendCallback option
     *
     * @param {function} callback The callback to run which allows
     *                            introspecting the blob before sending
     * @return {Raven}
     */
    setShouldSendCallback: function(callback) {
        this.globalOptions.shouldSendCallback = callback;

        return this;
    },

    /**
     * Override the default HTTP transport mechanism that transmits data
     * to the Sentry server.
     *
     * @param {function} transport Function invoked instead of the default
     *                             `makeRequest` handler.
     *
     * @return {Raven}
     */
    setTransport: function(transport) {
        this.globalOptions.transport = transport;

        return this;
    },

    /*
     * Get the latest raw exception that was captured by Raven.
     *
     * @return {error}
     */
    lastException: function() {
        return this.lastCapturedException;
    },

    /*
     * Get the last event id
     *
     * @return {string}
     */
    lastEventId: function() {
        return this._lastEventId;
    },

    /*
     * Determine if Raven is setup and ready to go.
     *
     * @return {boolean}
     */
    isSetup: function() {
        if (!this.hasJSON) return false;  // needs JSON support
        if (!this.globalServer) {
            if (!this.ravenNotConfiguredError)
              this._logDebug('error', 'Error: Raven has not been configured.');
            this.ravenNotConfiguredError = true;
            return false;
        }
        return true;
    },

    afterLoad: function () {
        // TODO: remove window dependence?

        // Attempt to initialize Raven on load
        var RavenConfig = window.RavenConfig;
        if (RavenConfig) {
            this.config(RavenConfig.dsn, RavenConfig.config).install();
        }
    },

    /**** Private functions ****/
    _triggerEvent: function(eventType, options) {
        // NOTE: `event` is a native browser thing, so let's avoid conflicting wiht it
        var evt, key;

        if (!this.hasDocument)
            return;

        options = options || {};

        eventType = 'raven' + eventType.substr(0,1).toUpperCase() + eventType.substr(1);

        if (document.createEvent) {
            evt = document.createEvent('HTMLEvents');
            evt.initEvent(eventType, true, true);
        } else {
            evt = document.createEventObject();
            evt.eventType = eventType;
        }

        for (key in options) if (hasKey(options, key)) {
            evt[key] = options[key];
        }

        if (document.createEvent) {
            // IE9 if standards
            document.dispatchEvent(evt);
        } else {
            // IE8 regardless of Quirks or Standards
            // IE9 if quirks
            try {
                document.fireEvent('on' + evt.eventType.toLowerCase(), evt);
            } catch(e) {}
        }
    },

    _parseDSN: function(str) {
        var m = dsnPattern.exec(str),
            dsn = {},
            i = 7;

        try {
            while (i--) dsn[dsnKeys[i]] = m[i] || '';
        } catch(e) {
            throw new RavenConfigError('Invalid DSN: ' + str);
        }

        if (dsn.pass)
            throw new RavenConfigError('Do not specify your private key in the DSN!');

        return dsn;
    },

    _handleStackInfo: function(stackInfo, options) {
        var self = this;
        var frames = [];

        if (stackInfo.stack && stackInfo.stack.length) {
            each(stackInfo.stack, function(i, stack) {
                var frame = self._normalizeFrame(stack);
                if (frame) {
                    frames.push(frame);
                }
            });
        }

        this._triggerEvent('handle', {
            stackInfo: stackInfo,
            options: options
        });

        this._processException(
            stackInfo.name,
            stackInfo.message,
            stackInfo.url,
            stackInfo.lineno,
            frames,
            options
        );
    },

    _normalizeFrame: function(frame) {
        if (!frame.url) return;

        // normalize the frames data
        var normalized = {
            filename:   frame.url,
            lineno:     frame.line,
            colno:      frame.column,
            'function': frame.func || '?'
        }, context = this._extractContextFromFrame(frame), i;

        if (context) {
            var keys = ['pre_context', 'context_line', 'post_context'];
            i = 3;
            while (i--) normalized[keys[i]] = context[i];
        }

        normalized.in_app = !( // determine if an exception came from outside of our app
            // first we check the global includePaths list.
            (!!this.globalOptions.includePaths.test && !this.globalOptions.includePaths.test(normalized.filename)) ||
            // Now we check for fun, if the function name is Raven or TraceKit
            /(Raven|TraceKit)\./.test(normalized['function']) ||
            // finally, we do a last ditch effort and check for raven.min.js
            /raven\.(min\.)?js$/.test(normalized.filename)
        );

        return normalized;
    },

    _extractContextFromFrame: function(frame) {
        // immediately check if we should even attempt to parse a context
        if (!frame.context || !this.globalOptions.fetchContext) return;

        var context = frame.context,
            pivot = ~~(context.length / 2),
            i = context.length, isMinified = false;

        while (i--) {
            // We're making a guess to see if the source is minified or not.
            // To do that, we make the assumption if *any* of the lines passed
            // in are greater than 300 characters long, we bail.
            // Sentry will see that there isn't a context
            if (context[i].length > 300) {
                isMinified = true;
                break;
            }
        }

        if (isMinified) {
            // The source is minified and we don't know which column. Fuck it.
            if (isUndefined(frame.column)) return;

            // If the source is minified and has a frame column
            // we take a chunk of the offending line to hopefully shed some light
            return [
                [],  // no pre_context
                context[pivot].substr(frame.column, 50), // grab 50 characters, starting at the offending column
                []   // no post_context
            ];
        }

        return [
            context.slice(0, pivot),    // pre_context
            context[pivot],             // context_line
            context.slice(pivot + 1)    // post_context
        ];
    },

    _processException: function(type, message, fileurl, lineno, frames, options) {
        var stacktrace, i, fullMessage;

        if (!!this.globalOptions.ignoreErrors.test && this.globalOptions.ignoreErrors.test(message)) return;

        message += '';
        message = truncate(message, this.globalOptions.maxMessageLength);

        fullMessage = type + ': ' + message;
        fullMessage = truncate(fullMessage, this.globalOptions.maxMessageLength);

        if (frames && frames.length) {
            fileurl = frames[0].filename || fileurl;
            // Sentry expects frames oldest to newest
            // and JS sends them as newest to oldest
            frames.reverse();
            stacktrace = {frames: frames};
        } else if (fileurl) {
            stacktrace = {
                frames: [{
                    filename: fileurl,
                    lineno: lineno,
                    in_app: true
                }]
            };
        }

        if (!!this.globalOptions.ignoreUrls.test && this.globalOptions.ignoreUrls.test(fileurl)) return;
        if (!!this.globalOptions.whitelistUrls.test && !this.globalOptions.whitelistUrls.test(fileurl)) return;

        // Fire away!
        this._send(
            objectMerge({
                // sentry.interfaces.Exception
                exception: {
                    values: [{
                        type: type,
                        value: message,
                        stacktrace: stacktrace
                    }]
                },
                culprit: fileurl,
                message: fullMessage
            }, options)
        );
    },

    _trimPacket: function(data) {
        // For now, we only want to truncate the two different messages
        // but this could/should be expanded to just trim everything
        var max = this.globalOptions.maxMessageLength;
        data.message = truncate(data.message, max);
        if (data.exception) {
            var exception = data.exception.values[0];
            exception.value = truncate(exception.value, max);
        }

        return data;
    },

    _getHttpData: function() {
        if (!this.hasDocument || !document.location || !document.location.href) {
            return;
        }

        var httpData = {
            headers: {
                'User-Agent': navigator.userAgent
            }
        };

        httpData.url = document.location.href;

        if (document.referrer) {
            httpData.headers.Referer = document.referrer;
        }

        return httpData;
    },


    _send: function(data) {
        var globalOptions = this.globalOptions;

        var baseData = {
            project: this.globalProject,
            logger: globalOptions.logger,
            platform: 'javascript'
        }, httpData = this._getHttpData();

        if (httpData) {
            baseData.request = httpData;
        }

        data = objectMerge(baseData, data);

        // Merge in the tags and extra separately since objectMerge doesn't handle a deep merge
        data.tags = objectMerge(objectMerge({}, this.globalContext.tags), data.tags);
        data.extra = objectMerge(objectMerge({}, this.globalContext.extra), data.extra);

        // Send along our own collected metadata with extra
        data.extra['session:duration'] = now() - this.startTime;

        // If there are no tags/extra, strip the key from the payload alltogther.
        if (isEmptyObject(data.tags)) delete data.tags;

        if (this.globalContext.user) {
            // sentry.interfaces.User
            data.user = this.globalContext.user;
        }

        // Include the release if it's defined in globalOptions
        if (globalOptions.release) data.release = globalOptions.release;
        // Include server_name if it's defined in globalOptions
        if (globalOptions.serverName) data.server_name = globalOptions.serverName;

        // Include the release if it's defined in globalOptions
        if (globalOptions.release) data.release = globalOptions.release;

        if (isFunction(globalOptions.dataCallback)) {
            data = globalOptions.dataCallback(data) || data;
        }

        // Why??????????
        if (!data || isEmptyObject(data)) {
            return;
        }

        // Check if the request should be filtered or not
        if (isFunction(globalOptions.shouldSendCallback) && !globalOptions.shouldSendCallback(data)) {
            return;
        }

        // Send along an event_id if not explicitly passed.
        // This event_id can be used to reference the error within Sentry itself.
        // Set lastEventId after we know the error should actually be sent
        this._lastEventId = data.event_id || (data.event_id = uuid4());

        // Try and clean up the packet before sending by truncating long values
        data = this._trimPacket(data);

        this._logDebug('debug', 'Raven about to send:', data);

        if (!this.isSetup()) return;

        (globalOptions.transport || this._makeRequest).call(this, {
            url: this.globalServer,
            auth: {
                sentry_version: '7',
                sentry_client: 'raven-js/' + this.VERSION,
                sentry_key: this.globalKey
            },
            data: data,
            options: globalOptions,
            onSuccess: function success() {
                this._triggerEvent('success', {
                    data: data,
                    src: this.globalServer
                });
            },
            onError: function failure() {
                this._triggerEvent('failure', {
                    data: data,
                    src: this.globalServer
                });
            }
        });
    },

    _makeImageRequest: function(opts) {
        // Tack on sentry_data to auth options, which get urlencoded
        opts.auth.sentry_data = JSON.stringify(opts.data);

        var img = this._newImage(),
            src = opts.url + '?' + urlencode(opts.auth),
            crossOrigin = opts.options.crossOrigin;

        if (crossOrigin || crossOrigin === '') {
            img.crossOrigin = crossOrigin;
        }
        img.onload = opts.onSuccess;
        img.onerror = img.onabort = opts.onError;
        img.src = src;
    },

    _makeXhrRequest: function(opts) {
        var request;

        function handler() {
            if (request.status === 200) {
                if (opts.onSuccess) {
                    opts.onSuccess();
                }
            } else if (opts.onError) {
                opts.onError();
            }
        }

        request = new XMLHttpRequest();
        if ('withCredentials' in request) {
            request.onreadystatechange = function () {
                if (request.readyState !== 4) {
                    return;
                }
                handler();
            };
        } else {
            request = new XDomainRequest();
            // onreadystatechange not supported by XDomainRequest
            request.onload = handler;
        }

        // NOTE: auth is intentionally sent as part of query string (NOT as custom
        //       HTTP header) so as to avoid preflight CORS requests
        request.open('POST', opts.url + '?' + urlencode(opts.auth));
        request.send(JSON.stringify(opts.data));
    },

    _makeRequest: function(opts) {
        var hasCORS =
            'withCredentials' in new XMLHttpRequest() ||
            typeof XDomainRequest !== 'undefined';

        return (hasCORS ? Raven._makeXhrRequest : Raven._makeImageRequest)(opts);
    },

    // Note: this is shitty, but I can't figure out how to get
    // sinon to stub document.createElement without breaking everything
    // so this wrapper is just so I can stub it for tests.
    _newImage: function() {
        return document.createElement('img');
    },

    _logDebug: function(level) {
        if (this.originalConsoleMethods[level] && this.debug) {
            this.originalConsoleMethods[level].apply(this.originalConsole, [].slice.call(arguments, 1));
        }
    },

    _mergeContext: function(key, context) {
        if (isUndefined(context)) {
            delete this.globalContext[key];
        } else {
            this.globalContext[key] = objectMerge(this.globalContext[key] || {}, context);
        }
    }
};

// Deprecations
Raven.prototype.setUser = Raven.prototype.setUserContext;
Raven.prototype.setReleaseContext = Raven.prototype.setRelease;

var dsnKeys = 'source protocol user pass host port path'.split(' '),
    dsnPattern = /^(?:(\w+):)?\/\/(?:(\w+)(:\w+)?@)?([\w\.-]+)(?::(\d+))?(\/.*)/;

function now() {
    return +new Date();
}

module.exports = Raven;
