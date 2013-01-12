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

    // Create the XHR object.
    function createCORSRequest(method, url) {
        var xhr = new XMLHttpRequest();
        if ("withCredentials" in xhr) {
            // XHR for Chrome/Firefox/Opera/Safari.
            xhr.open(method, url, true);
        } else if (typeof XDomainRequest != "undefined") {
            // XDomainRequest for IE.
            xhr = new XDomainRequest();
            xhr.open(method, url);
        } else {
            // CORS not supported.
            xhr = null;
        }
        return xhr;
    }

    var globalOptions = {
        secretKey: undefined,  // The global key if not using project auth
        publicKey: undefined,  // Leave as undefined if not using project auth
        servers: [],
        projectId: 1,
        logger: 'javascript',
        site: undefined,
        dataCallback: null,
        signatureUrl: undefined,
        fetchHeaders: false,  // Generates a synchronous request to your server
        ignoreErrors: [],
        ignoreUrls: []
    };

    Raven.config = function(config) {
        var servers = [];

        if (typeof(config) === 'string') {
            if (config.indexOf('http') === 0) {
                // new-style DSN configuration
                config = Raven.parseDSN(config);
            } else {
                throw 'Base64 encoded config is no longer supported - use DSN';
            }
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

    Raven.getSignature = function(message, timestamp, callback) {
        // bail if there is no signatureUrl set
        if (!globalOptions.signatureUrl) return callback();

        var xhr = createCORSRequest('POST', globalOptions.signatureUrl),
            body = 'message=' + encodeURIComponent(message) +
                   '&timestamp=' + encodeURIComponent(timestamp);
        xhr.onload = function() {
            if (xhr.status === 200) {
                callback(JSON.parse(xhr.responseText).signature);
            } else {
                callback();
            }
        };
        xhr.onerror = function() {
            callback();
        };
        xhr.send(body);
    };

    Raven.getAuthQueryString = function(signature, timestamp) {
        var qs = [
            'sentry_version=2.0',
            'sentry_timestamp=' + timestamp,
            'sentry_client=raven-js/' + self.VERSION
        ];
        if (globalOptions.publicKey) {
            qs.push('sentry_key=' + globalOptions.publicKey);
        }
        if (signature) {
            qs.push('sentry_signature=' + signature);
        }
        return '?' + qs.join('&');
    };

    function handleStackInfo(stackInfo, options) {
        var frames = [], i, j;
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
                var pivot = ~~(currentStack.context.length / 2);
                currentFrame.pre_context = currentStack.context.slice(0, pivot);
                currentFrame.context_line = currentStack.context[pivot];
                currentFrame.post_context = currentStack.context.slice(pivot + 1);
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
                'message': msg
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
        var encoded_msg,
            timestamp = new Date().getTime(),
            url = window.location.protocol + '//' + window.location.host + window.location.pathname,
            querystring = window.location.search.slice(1);  // Remove the ?

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

        encoded_msg = JSON.stringify(data);
        self.getSignature(encoded_msg, timestamp, function(signature) {
            var auth = self.getAuthQueryString(signature, timestamp), xhr;
            each(globalOptions.servers, function (i, server) {
                xhr = createCORSRequest('POST', server + auth);
                xhr.send(encoded_msg);
            });
        });
    }
})(window);
