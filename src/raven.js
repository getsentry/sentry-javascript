// Raven.js
//
// Originally based on the Arecibo JavaScript client.
//
// Requires:
//     * TraceKit
//     * parseUri (included in the full and minified distribution files)

;(function(window, undefined){
    // Save a reference to the global object (`window` in the browser, `global`
    // on the server).
    'use strict';

    var Raven;
    window.Raven = Raven = {};

    var self = Raven;

    Raven.VERSION = '@VERSION';

    var hasJSON = typeof(window.JSON) !== 'undefined';

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

    var globalOptions = {
        secretKey: undefined,  // The global key if not using project auth
        publicKey: undefined,  // Leave as undefined if not using project auth
        servers: [],
        projectId: 1,
        logger: 'javascript',
        site: undefined,
        dataCallback: null,
        fetchHeaders: false,  // Generates a synchronous request to your server
        ignoreErrors: [],
        ignoreUrls: []
    };

    Raven.config = function(config) {
        var servers = [];

        if (typeof(config) === 'string') {
            config = Raven.parseDSN(config);
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
    };

    Raven.install = function() {
        if (!hasJSON) return;  // no sense installing without JSON support

        TraceKit.report.subscribe(handleStackInfo);
    };

    Raven.parseDSN = function(dsn) {
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
            secretKey: uri.password,
            projectId: project_id
        };
    };

    Raven.getAuthQueryString = function(timestamp) {
        var qs = [
            'sentry_version=2.0',
            'sentry_timestamp=' + timestamp,
            'sentry_client=raven-js/' + self.VERSION
        ];
        if (globalOptions.publicKey) {
            qs.push('sentry_key=' + globalOptions.publicKey);
        }
        return '?' + qs.join('&');
    };

    function handleStackInfo(stackInfo, options) {
        var frames = [], pivot, context, i, j, ii, jj;
        for (i = 0, j = stackInfo.stack.length; i < j; i++) {
            // normalize the frames data
            var currentStack = stackInfo.stack[i],
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

    // lol, awesome
    Raven.captureException = TraceKit.report;

    Raven.captureMessage = function(msg, options) {
        // Fire away!
        send(
            arrayMerge({
                message: msg
            }, options)
        );
    };

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

        var encoded_msg = '&sentry_data=' + encodeURIComponent(JSON.stringify(data)),
            timestamp = new Date().getTime(),
            url = window.location.protocol + '//' + window.location.host + window.location.pathname,
            querystring = window.location.search.slice(1),  // Remove the ?
            auth = self.getAuthQueryString(timestamp),
            xhr;

        data = arrayMerge({
            project: globalOptions.projectId,
            logger: globalOptions.logger,
            site: globalOptions.site,
            timestamp: new Date(),
            'sentry.interfaces.Http': {
                url: url,
                querystring: querystring
            }
        }, data);

        if (typeof(globalOptions.dataCallback) === 'function') {
            data = globalOptions.dataCallback(data);
        }

        data.timestamp = dateToISOString(data.timestamp);

        each(globalOptions.servers, function (i, server) {
            new Image().src = server + auth + encoded_msg;
        });
    }
})(window);
