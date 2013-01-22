// Raven.js
//
// Originally based on the Arecibo JavaScript client.
//
// Requires:
//     * TraceKit (included in the full and minified distribution files)

'use strict';

// First, check for JSON support
// If there is no JSON, we no-op the core features of Raven
// since JSON is required to encode the payload
var _Raven = window.Raven,
    hasJSON = !isUndefined(window.JSON),
    globalServer,
    globalUser,
    globalKey,
    globalProject,
    globalOptions = {
        logger: 'javascript',
        ignoreErrors: [],
        ignoreUrls: []
    };

/*
 * The core Raven object
 */
var Raven = {
    VERSION: '@VERSION',

    /*
     * Raven.noConflict()
     *
     * Allow multiple versions of Raven to be installed.
     */
    noConflict: function() {
        window.Raven = _Raven;
        return Raven;
    },

    /*
     * Raven.config()
     *
     * Configure raven with a DSN and extra options
     */
    config: function(dsn, options) {
        var uri = parseUri(dsn),
            lastSlash = uri.path.lastIndexOf('/'),
            path = uri.path.substr(1, lastSlash);

        // merge in options
        if (options) {
            each(options, function(key, value){
                globalOptions[key] = value;
            });
        }

        // "Script error." is hard coded into browsers for errors that it can't read.
        // this is the result of a script being pulled in from an external domain and CORS.
        globalOptions.ignoreErrors.push('Script error.');

        globalKey = uri.user;
        globalProject = ~~uri.path.substr(lastSlash + 1);

        // assemble the endpoint from the uri pieces
        globalServer = uri.protocol + '://' + uri.host +
                      (uri.port ? ':' + uri.port : '') +
                      '/' + path + 'api/' + globalProject + '/store/';

        // return for chaining
        return Raven;
    },

    /*
     * Raven.install()
     *
     * Installs a global window.onerror error handler
     * to capture and report uncaught exceptions.
     */
    install: function() {
        if (!isSetup()) return;

        TraceKit.report.subscribe(handleStackInfo);

        return Raven;
    },

    /*
     * Raven.context()
     *
     * Wrap code within a context so Raven can capture errors
     * reliably across domains that is executed immediately.
     */
    context: function(options, func, args) {
        if (isFunction(options)) {
            args = func;
            func = options;
            options = undefined;
        }

        Raven.wrap(options, func).apply(this, args);
    },

    /* Raven.wrap()
     *
     * Wrap code within a context and returns back a new function to be executed
     */
    wrap: function(options, func) {
        // options is optional
        if (isFunction(options)) {
            func = options;
            options = undefined;
        }

        return function() {
            try {
                func.apply(this, arguments);
            } catch(e) {
                Raven.captureException(e, options);
            }
        };
    },

    /*
     * Raven.uninstall()
     *
     * Uninstalls the global error handler.
     */
    uninstall: function() {
        TraceKit.report.unsubscribe(handleStackInfo);

        return Raven;
    },

    /*
     * Raven.captureException()
     *
     * Manually capture an exception and send it over to Sentry
     */
    captureException: function(ex, options) {
        // TraceKit.report will re-raise any exception passed to it,
        // which means you have to wrap it in try/catch. Instead, we
        // can wrap it here and only re-raise if TraceKit.report
        // raises an exception different from the one we asked to
        // report on.
        try {
            TraceKit.report(ex, options);
        } catch(ex1) {
            if(ex !== ex1) {
                throw ex1;
            }
        }

        return Raven;
    },

    /*
     * Raven.captureMessage()
     *
     * Manually send a message to Sentry
     */
    captureMessage: function(msg, options) {
        // Fire away!
        send(
            arrayMerge({
                message: msg
            }, options)
        );

        return Raven;
    },

    /*
     * Raven.setUser()
     *
     * Set/clear a user to be sent along with the payload.
     */
    setUser: function(user) {
       globalUser = user;

       return Raven;
    }
};

/**** Private functions ****/
function parseUri(str) {
    var keys = 'source protocol authority userInfo user password host port relative path directory file query anchor'.split(' '),
        m = /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/.exec(str),
        uri = {},
        i = 14;

    while (i--) uri[keys[i]] = m[i] || '';

    return uri;
}

function isUndefined(what) {
    return typeof what === 'undefined';
}

function isFunction(what) {
    return typeof what === 'function';
}

function each(obj, callback) {
    var i, j;

    if (obj.length === undefined) {
        for (i in obj) {
            if (obj.hasOwnProperty(i)) {
                callback.call(null, i, obj[i]);
            }
        }
    } else {
        for (i = 0, j = obj.length; i < j; i++) {
            callback.call(null, i, obj[i]);
        }
    }
}

var cachedAuth;

function getAuthQueryString() {
    if (cachedAuth) return cachedAuth;

    var qs = [
        'sentry_version=2.0',
        'sentry_client=raven-js/' + Raven.VERSION
    ];
    if (globalKey) {
        qs.push('sentry_key=' + globalKey);
    }

    cachedAuth = '?' + qs.join('&');
    return cachedAuth;
}

function handleStackInfo(stackInfo, options) {
    var frames = [], i = stackInfo.stack.length;

    while (i--) frames[i] = normalizeFrame(stackInfo.stack[i]);

    processException(
        stackInfo.name,
        stackInfo.message,
        stackInfo.url,
        stackInfo.lineno,
        frames,
        options
    );
}

function normalizeFrame(frame) {
    // normalize the frames data
    var normalized = {
        abs_path:   frame.url,
        filename:   frame.url.split(/\/([^\/]+)$/)[1] || frame.url, // extract the filename
        lineno:     frame.line,
        colno:      frame.column,
        'function': frame.func
    }, context = extractContextFromFrame(frame);

    if (context) {
        var i = 3, keys = ['pre_context', 'context_line', 'post_context'];
        while (i--) normalized[keys[i]] = context[i];
    }

    return normalized;
}

function extractContextFromFrame(frame) {
    if (!frame.context) return;

    var context = frame.context,
        pivot = ~~(context.length / 2),
        i = context.length, isMinified = false, line;

    while(i--) {
        line = context[i];
        // We're making a guess to see if the source is minified or not.
        // To do that, we make the assumption if *any* of the lines passed
        // in are greater than 300 characters long, we bail.
        // Sentry will see that there isn't a context
        if (line.length > 300) {
            isMinified = true;
            break;
        }
    }

    if (isMinified) {
        // The source is minified and we don't know which column. Fuck it.
        if (isUndefined(frame.column)) return;

        // Source maps are enabled and has a column number, let Sentry try and grab it
        if (globalOptions.sourceMaps) return;

        // If the source is minified with sourcemaps disabled and has a frame column
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
}

function processException(type, message, fileurl, lineno, frames, options) {
    var stacktrace, label, i;

    // IE8 really doesn't have Array.prototype.indexOf
    // Filter out a message that matches our ignore list
    i = globalOptions.ignoreErrors.length;
    while (i--) {
        if (message === globalOptions.ignoreErrors[i]) {
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

    i = globalOptions.ignoreUrls.length;
    while (i--) {
        if (globalOptions.ignoreUrls[i].test(fileurl)) {
            return;
        }
    }

    label = lineno ? message + ' at ' + lineno : message;

    // Fire away!
    send(
        arrayMerge({
            'sentry.interfaces.Exception': {
                type: type,
                value: message
            },
            'sentry.interfaces.Stacktrace': stacktrace,
            culprit: fileurl,
            message: label
        }, options)
    );
}

function arrayMerge(arr1, arr2) {
    if (!arr2) {
        return arr1;
    }
    each(arr2, function(key, value){
        arr1[key] = value;
    });
    return arr1;
}

function send(data) {
    if (!isSetup()) return;

    var url = window.location.protocol + '//' + window.location.host + window.location.pathname,
        querystring = window.location.search.slice(1);  // Remove the ?

    data = arrayMerge({
        project: globalProject,
        logger: globalOptions.logger,
        site: globalOptions.site,
        platform: 'javascript',
        'sentry.interfaces.Http': {
            url: url,
            querystring: querystring,
            cookie: window.document.cookie
        }
    }, data);

    if (globalUser) data['sentry.interfaces.User'] = globalUser;

    if (isFunction(globalOptions.dataCallback)) {
        data = globalOptions.dataCallback(data);
    }

    makeRequest(data);
}

function makeRequest(data) {
    new Image().src = globalServer + getAuthQueryString() + '&sentry_data=' + encodeURIComponent(JSON.stringify(data));
}

function isSetup() {
    if (!hasJSON) return false;  // needs JSON support
    if (!globalServer) {
        console.error("Error: Raven has not been configured.");
        return false;
    }
    return true;
}
