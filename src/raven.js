;(function(global) {
    'use strict';

    var _Raven = global.Raven,
        TK = TraceKit.noConflict();

    // Disable Tracekit's remote fetching by default
    TK.remoteFetching = false;

    /*
     * The core Raven singleton
     *
     * @this {Raven}
     */
    var Raven = {
        VERSION: '@VERSION',

        // If there is no JSON, we no-op the core features of Raven
        // since JSON is required to encode the payload
        hasJSON: !!(global.JSON && global.JSON.stringify),

        server: null,
        user: null,
        key: null,

        options: {
            logger: 'javascript',
            ignoreErrors: [],
            ignoreUrls: [],
            whitelistUrls: [],
            includePaths: [],
            tags: {}
        },

        /*
         * Allow Raven to be configured as soon as it is loaded
         * It uses a global RavenConfig = {dsn: '...', config: {}}
         *
         * @return undefined
         */
        afterLoad: function() {
            if (global.RavenConfig) {
                this.config(global.RavenConfig.dsn, global.RavenConfig.config).install();
            }
        },

        /*
         * Allow multiple versions of Raven to be installed.
         * Strip Raven from the global context and returns the instance.
         *
         * @return {Raven}
         */
        noConflict: function() {
            global.Raven = _Raven;
            return Raven;
        },

        /*
         * Configure Raven with a DSN and extra options
         *
         * @param {string} dsn The public Sentry DSN
         * @param {object} options Optional set of of global options [optional]
         * @return {Raven}
         */
        config: function(dsn, options) {
            var uri = this.parseUri(dsn),
                lastSlash = uri.path.lastIndexOf('/'),
                path = uri.path.substr(1, lastSlash);

            // merge in options
            if (options) {
                this.each(options, this.hitch(this, function(key, value) {
                    this.options[key] = value;
                }));
            }

            // join regexp rules into one big rule
            this.options.ignoreUrls = this.options.ignoreUrls.length ? this.joinRegExp(this.options.ignoreUrls) : false;
            this.options.whitelistUrls = this.options.whitelistUrls.length ? this.joinRegExp(this.options.whitelistUrls) : false;
            this.options.includePaths = this.joinRegExp(this.options.includePaths);

            // "Script error." is hard coded into browsers for errors that it can't read.
            // this is the result of a script being pulled in from an external domain and CORS.
            this.options.ignoreErrors.push('Script error.');

            this.key = uri.user;
            this.project = ~~uri.path.substr(lastSlash + 1);

            // assemble the endpoint from the uri pieces
            this.server = '//' + uri.host +
                          (uri.port ? ':' + uri.port : '') +
                          '/' + path + 'api/' + this.project + '/store/';

            if (uri.protocol) {
                this.server = uri.protocol + ':' + this.server;
            }

            if (this.options.fetchContext) {
                TK.remoteFetching = true;
            }

            if (this.options.linesOfContext) {
                TK.linesOfContext = this.options.linesOfContext;
            }

            // return for chaining
            return Raven;
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
            if (!this.isSetup()) {
                return;
            }

            TK.report.subscribe(this.handleStackInfo);

            return Raven;
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
            if (this.isFunction(options)) {
                args = func || [];
                func = options;
                options = undefined;
            }

            Raven.wrap(options, func).apply(this, args);
        },

        /*
         * Wrap code within a context and returns back a new function to be executed
         *
         * @param {object} options A specific set of options for this context [optional]
         * @param {function} func The function to be wrapped in a new context
         * @return {function} The newly wrapped functions with a context
         */
        wrap: function(options, func) {
            // options is optional
            if (this.isFunction(options)) {
                func = options;
                options = undefined;
            }

            return function() {
                try {
                    return func.apply(this, arguments);
                } catch (e) {
                    Raven.captureException(e, options);
                    throw e;
                }
            };
        },

        /*
         * Uninstalls the global error handler.
         *
         * @return {Raven}
         */
        uninstall: function() {
            TK.report.unsubscribe(this.handleStackInfo);

            return Raven;
        },

        /*
         * Manually capture an exception and send it over to Sentry
         *
         * @param {error} ex An exception to be logged
         * @param {object} options A specific set of options for this error [optional]
         * @return {Raven}
         */
        captureException: function(ex, options) {
            // If a string is passed through, recall as a message
            if (typeof ex === 'string') {
                return Raven.captureMessage(ex, options);
            }

            // TraceKit.report will re-raise any exception passed to it,
            // which means you have to wrap it in try/catch. Instead, we
            // can wrap it here and only re-raise if TraceKit.report
            // raises an exception different from the one we asked to
            // report on.
            try {
                TK.report(ex, options);
            } catch (ex1) {
                if (ex !== ex1) {
                    throw ex1;
                }
            }

            return Raven;
        },

        /*
         * Manually send a message to Sentry
         *
         * @param {string} msg A plain message to be captured in Sentry
         * @param {object} options A specific set of options for this message [optional]
         * @return {Raven}
         */
        captureMessage: function(msg, options) {
            // Fire away!
            this.send(
                this.arrayMerge({
                    message: msg
                }, options)
            );

            return Raven;
        },

        /*
         * Set/clear a user to be sent along with the payload.
         *
         * @param {object} user An object representing user data [optional]
         * @return {Raven}
         */
        setUser: function(user) {
            this.user = user;

            return Raven;
        },

        /**** Private functions ****/

        uriKeys: 'source protocol authority userInfo user password host port relative path directory file query anchor'.split(' '),
        uriPattern: /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/,

        parseUri: function(str) {
            var m = this.uriPattern.exec(str),
                uri = {},
                i = 14;

            while (i--) {
                uri[this.uriKeys[i]] = m[i] || '';
            }

            return uri;
        },

        isUndefined: function(what) {
            return typeof what === 'undefined';
        },

        isFunction: function(what) {
            return typeof what === 'function';
        },

        each: function(obj, callback) {
            var i, j;

            if (Raven.isUndefined(obj.length)) {
                for (i in obj) {
                    if (obj.hasOwnProperty(i)) {
                        callback.call(this, i, obj[i]);
                    }
                }
            } else {
                j = obj.length;
                if (j) {
                    for (i = 0; i < j; i++) {
                        callback.call(this, i, obj[i]);
                    }
                }
            }
        },

        triggerEvent: function(eventType, options) {
            var event, key;

            eventType = 'raven' + eventType[0].toUpperCase() + eventType.substr(1);

            if (document.createEvent) {
                event = document.createEvent('HTMLEvents');
                event.initEvent(eventType, true, true);
            } else {
                event = document.createEventObject();
                event.eventType = eventType;
            }

            if (typeof options !== 'object') {
                options = {};
            }

            for (key in options) {
                if (options.hasOwnProperty(key)) {
                    event[key] = options[key];
                }
            }

            if (document.createEvent) {
                document.dispatchEvent(event);
            } else {
                document.fireEvent('on' + event.eventType.toLowerCase(), event);
            }
        },

        cachedAuth: null,

        getAuthQueryString: function() {
            if (this.cachedAuth) {
                return this.cachedAuth;
            }

            var qs = [
                'sentry_version=3',
                'sentry_client=raven-js/' + this.VERSION
            ];
            if (this.key) {
                qs.push('sentry_key=' + this.key);
            }

            this.cachedAuth = '?' + qs.join('&');
            return this.cachedAuth;
        },

        normalizeFrame: function(frame) {
            if (!frame.url) {
                return;
            }

            // normalize the frames data
            var normalized = {
                filename:   frame.url,
                lineno:     frame.line,
                colno:      frame.column,
                'function': frame.func || '?'
            }, context = this.extractContextFromFrame(frame), i;

            if (context) {
                var keys = ['pre_context', 'context_line', 'post_context'];
                i = 3;
                while (i--) {
                    normalized[keys[i]] = context[i];
                }
            }

            normalized.in_app = !( // determine if an exception came from outside of our app
                // first we check the global includePaths list.
                !this.options.includePaths.test(normalized.filename) ||
                // Now we check for fun, if the function name is Raven or TraceKit
                /(Raven|TraceKit)\./.test(normalized['function']) ||
                // finally, we do a last ditch effort and check for raven.min.js
                /raven\.(min\.)js$/.test(normalized.filename)
            );

            return normalized;
        },

        handleStackInfo: function(stackInfo, options) {
            var frames = [];

            if (stackInfo.stack && stackInfo.stack.length) {
                this.each(stackInfo.stack, this.hitch(this, function(i, stack) {
                    var frame = this.normalizeFrame(stack);
                    if (frame) {
                        frames.push(frame);
                    }
                }));
            }

            this.triggerEvent('handle', {
                stackInfo: stackInfo,
                options: options
            });

            this.processException(
                stackInfo.name,
                stackInfo.message,
                stackInfo.url,
                stackInfo.lineno,
                frames,
                options
            );
        },

        extractContextFromFrame: function(frame) {
            // immediately check if we should even attempt to parse a context
            if (!frame.context || !this.options.fetchContext) {
                return;
            }

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
                if (this.isUndefined(frame.column)) {
                    return;
                }

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

        processException: function(type, message, fileurl, lineno, frames, options) {
            var stacktrace, label, i;

            // IE8 really doesn't have Array.prototype.indexOf
            // Filter out a message that matches our ignore list
            i = this.options.ignoreErrors.length;
            while (i--) {
                if (message === this.options.ignoreErrors[i]) {
                    return;
                }
            }

            if (frames && frames.length) {
                stacktrace = {frames: frames};
                fileurl = fileurl || frames[0].filename;
            } else if (fileurl) {
                stacktrace = {
                    frames: [{
                        filename: fileurl,
                        lineno: lineno
                    }]
                };
            }

            if (this.options.ignoreUrls && this.options.ignoreUrls.test(fileurl)) {
                return;
            }
            if (this.options.whitelistUrls && !this.options.whitelistUrls.test(fileurl)) {
                return;
            }

            label = lineno ? message + ' at ' + lineno : message;

            // Fire away!
            this.send(
                this.arrayMerge({
                    'sentry.interfaces.Exception': {
                        type: type,
                        value: message
                    },
                    'sentry.interfaces.Stacktrace': stacktrace,
                    culprit: fileurl,
                    message: label
                }, options)
            );
        },

        arrayMerge: function(arr1, arr2) {
            if (!arr2) {
                return arr1;
            }
            this.each(arr2, function(key, value) {
                arr1[key] = value;
            });
            return arr1;
        },

        getHttpData: function() {
            var http = {
                url: document.location.href,
                headers: {
                    'User-Agent': navigator.userAgent
                }
            };

            if (document.referrer) {
                http.headers.Referer = document.referrer;
            }

            return http;
        },

        send: function(data) {
            if (!this.isSetup()) {
                return;
            }

            data = this.arrayMerge({
                project: this.project,
                logger: Raven.options.logger,
                site: Raven.options.site,
                platform: 'javascript',
                'sentry.interfaces.Http': this.getHttpData()
            }, data);

            // Merge in the tags separately since arrayMerge doesn't handle a deep merge
            data.tags = this.arrayMerge(Raven.options.tags, data.tags);

            // If there are no tags, strip the key from the payload alltogther.
            if (!data.tags) {
                delete data.tags;
            }

            if (this.user) {
                data['sentry.interfaces.User'] = this.user;
            }

            if (this.isFunction(this.options.dataCallback)) {
                data = this.options.dataCallback(data);
            }

            // Check if the request should be filtered or not
            if (this.isFunction(this.options.shouldSendCallback) && !this.options.shouldSendCallback(data)) {
                return;
            }

            this.makeRequest(data);
        },

        hitch: function(scope, fn) {
            return function() {
                fn.apply(scope, arguments);
            };
        },

        makeRequest: function(data) {
            var img, src;

            var success = function() {
                this.triggerEvent('success', {
                    data: data,
                    src: src
                });
            };

            var failure = function() {
                this.triggerEvent('failure', {
                    data: data,
                    src: src
                });
            };

            src = this.server + this.getAuthQueryString() + '&sentry_data=' + encodeURIComponent(JSON.stringify(data));
            img = new Image();
            img.onload = this.hitch(this, success);
            img.onerror = this.hitch(this, failure);
            img.onabort = this.hitch(this, failure);
            img.src = src;
        },

        isSetup: function() {
            if (!this.hasJSON) {
                return false;  // needs JSON support
            }
            if (!this.server) {
                if (global.console && console.error) {
                    console.error("Error: Raven has not been configured.");
                }
                return false;
            }
            return true;
        },

        wrapArguments: function(what) {
            if (!this.isFunction(what)) {
                return what;
            }

            var wrapped = function() {
                var args = [], i = arguments.length, arg;
                while (i--) {
                    arg = arguments[i];
                    args[i] = this.isFunction(arg) ? this.wrap(arg) : arg;
                }
                what.apply(null, args);
            };

            // copy over properties of the old function
            for (var k in what) wrapped[k] = what[k];
            return wrapped;
        },

        joinRegExp: function(patterns) {
            // Combine an array of regular expressions into one large regexp
            var sources = [], i = patterns.length;
            // lol, map
            while (i--) {
                sources[i] = patterns[i].source;
            }
            return new RegExp(sources.join('|'), 'i');
        }

    };

    // Exports
    global.Raven = Raven;
    global.TK = TK;

    // Legacy:
    global.Raven.server = global.globalServer || global.Raven.server;
    global.Raven.user = global.globalUser || global.Raven.user;
    global.Raven.project = global.globalProject || global.Raven.project;
    global.Raven.key = global.globalKey || global.Raven.key;

    // Boot.
    global.Raven.afterLoad();

})(window);