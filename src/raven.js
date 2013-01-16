// Raven.js
//
// Originally based on the Arecibo JavaScript client.
//
// Requires:
//     * TraceKit
//     * parseUri (included in the full and minified distribution files)

;(function(window, undefined){

'use strict';

// First, check for JSON support
// If there is no JSON, we no-op the core features of Raven
// since JSON is required to encode the payload
var hasJSON = typeof(window.JSON) !== 'undefined',
    globalOptions = {
        publicKey: undefined,  // Leave as undefined if not using project auth
        servers: [],
        projectId: 1,
        logger: 'javascript',
        site: undefined,
        dataCallback: null,
        ignoreErrors: [],
        ignoreUrls: []
    };

/*
 * The core Raven object
 */
var Raven = {
    VERSION: '@VERSION',

    /*
     * Raven.config()
     *
     * Configure raven with a DSN or config object
     */
    config: function(config) {
        var servers = [];

        if (typeof(config) === 'string') {
            config = parseDSN(config);
        }

        each(config, function(key, option) {
            globalOptions[key] = option;
        });

        // Expand server base URLs into API URLs
        each(globalOptions.servers, function(i, server) {
            // Add a trailing slash if one isn't provided
            if (server.slice(-1) !== '/') {
                server += '/';
            }
            servers.push(server + 'api/' + globalOptions.projectId + '/store/');
        });
        globalOptions.servers = servers;

        return this;
    },

    /*
     * Raven.install()
     *
     * Installs a global window.onerror error handler
     * to capture and report uncaught exceptions.
     */
    install: function() {
        if (!hasJSON) return;  // no sense installing without JSON support

        TraceKit.report.subscribe(handleStackInfo);
    },

    /*
     * Raven.captureException()
     *
     * Manually capture an exception and send it over to Sentry
     */
    captureException: function(ex) {
        // TraceKit.report will re-raise any exception passed to it,
        // which means you have to wrap it in try/catch. Instead, we
        // can wrap it here and only re-raise if TraceKit.report
        // raises an exception different from the one we asked to
        // report on.
        try {
            TraceKit.report(ex);
        } catch(ex1) {
            if(ex !== ex1) {
                throw ex1;
            }
        }
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

function parseDSN(dsn) {
    var uri = parseUri(dsn),
        path_idx = uri.path.lastIndexOf('/'),
        project_id,
        path;

    if (path_idx === -1) {
        project_id = uri.path.substr(1);
        path = '';
    } else {
        path = uri.path.substr(1, path_idx);
        project_id = uri.path.substr(path_idx + 1);
    }

    return {
        servers: [uri.protocol + '://' + uri.host + (uri.port ? ':' + uri.port : '') + '/' + path],
        publicKey: uri.user,
        projectId: project_id
    };
}

function getAuthQueryString(timestamp) {
    var qs = [
        'sentry_version=2.0',
        'sentry_timestamp=' + timestamp,
        'sentry_client=raven-js/' + Raven.VERSION
    ];
    if (globalOptions.publicKey) {
        qs.push('sentry_key=' + globalOptions.publicKey);
    }
    return '?' + qs.join('&');
}

function handleStackInfo(stackInfo, options) {
    var frames = [], pivot, context, i, j, ii, jj, currentStack, currentFrame;

    for (i = 0, j = stackInfo.stack.length; i < j; i++) {
        // normalize the frames data
        currentStack = stackInfo.stack[i];
        currentFrame = {
            abs_path:   currentStack.url,
            filename:   currentStack.url.split(/\/([^\/]+)$/)[1] || currentStack.url, // extract the filename
            lineno:     currentStack.line,
            'function': currentStack.func
        };

        if (currentStack.context) {
            context = currentStack.context;
            for(ii = 0, jj = context.length; ii < jj; ii++) {
                if (context[ii].length > 150) context[ii] = '...truncated...';
            }
            pivot = ~~(context.length / 2);
            currentFrame.pre_context = context.slice(0, pivot);
            currentFrame.context_line = context[pivot];
            currentFrame.post_context = context.slice(pivot + 1);
        }

        frames[i] = currentFrame;
    }
    processException(
        stackInfo.name,
        stackInfo.message,
        stackInfo.url,
        stackInfo.lineno,
        frames,
        options
    );
}

function processException(type, message, fileurl, lineno, frames, options) {
    var stacktrace, label, i, j;

    for (i = 0, j = globalOptions.ignoreErrors.length; i < j; i++) {
        if (message === globalOptions.ignoreErrors[i]) {
            return;
        }
    }

    if (frames) {
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

    for (i = 0, j = globalOptions.ignoreUrls.length; i < j; i++) {
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
    if (typeof(arr2) === 'undefined') {
        return arr1;
    }
    each(arr2, function(key, value){
        arr1[key] = value;
    });
    return arr1;
}

function pad(n, amount) {
    var i,
        len = ('' + n).length;
    if (typeof(amount) === 'undefined') {
        amount = 2;
    }
    if (len >= amount) {
        return n;
    }
    for (i=0; i < (amount - len); i++) {
        n = '0' + n;
    }
    return n;
}

function dateToISOString(date) {
    if (Date.prototype.toISOString) {
        return date.toISOString();
    }

    return date.getUTCFullYear() + '-' +
        pad(date.getUTCMonth() + 1) + '-' +
        pad(date.getUTCDate()) + 'T' +
        pad(date.getUTCHours()) + ':' +
        pad(date.getUTCMinutes()) + ':' +
        pad(date.getUTCSeconds()) + '.' +
        pad(date.getUTCMilliseconds(), 3) + 'Z';
}

function send(data) {
    if (!hasJSON) return;  // needs JSON support

    var encoded_msg,
        now = new Date(),
        url = window.location.protocol + '//' + window.location.host + window.location.pathname,
        querystring = window.location.search.slice(1),  // Remove the ?
        auth = getAuthQueryString(now.getTime());

    data = arrayMerge({
        project: globalOptions.projectId,
        logger: globalOptions.logger,
        site: globalOptions.site,
        timestamp: dateToISOString(now),
        platform: 'javascript',
        'sentry.interfaces.Http': {
            url: url,
            querystring: querystring
        }
    }, data);

    if (typeof(globalOptions.dataCallback) === 'function') {
        data = globalOptions.dataCallback(data);
    }

    encoded_msg = '&sentry_data=' + encodeURIComponent(JSON.stringify(data));

    each(globalOptions.servers, function (i, server) {
        new Image().src = server + auth + encoded_msg;
    });
}

// Expose Raven to the world
window.Raven = Raven;

})(window);
