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
    "use strict";

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

    function getXHR() {
        if (window.XMLHttpRequest) {
            return new window.XMLHttpRequest();
        } else if (window.ActiveXObject) { // IE
            return new window.ActiveXObject("MSXML2.XMLHTTP.3.0");
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
        signatureUrl: undefined,
        fetchHeaders: false,  // Generates a synchronous request to your server
        ignoreErrors: [],
        ignoreUrls: []
    };

    Raven.config = function(config) {
        var servers = [];

        if (typeof(config) === "string") {
            if (config.indexOf('http') === 0) {
                // new-style DSN configuration
                config = Raven.parseDSN(config);
            } else {
                throw "Base64 encoded config is no longer supported - use DSN";
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
    };

    Raven.install = function() {
        TraceKit.report.subscribe(handleStackInfo);
    };

    Raven.parseDSN = function(dsn) {
        var uri = parseUri(dsn);
        var path_idx = uri.path.lastIndexOf('/');
        var project_id;
        var path;

        if (path_idx === -1) {
            project_id = uri.path.substr(1);
            path = '';
        } else {
            path = uri.path.substr(1, path_idx);
            project_id = uri.path.substr(path_idx + 1);
        }

        return {
            servers: [uri.protocol + '://' + uri.host + ':' + uri.port + '/' + path],
            publicKey: uri.user,
            secretKey: uri.password,
            projectId: project_id
        };
    };

    // wtf is this doing?
    Raven.getHeaders = function() {
        var headers = {};

        if (globalOptions.fetchHeaders) {
            var xhr = getXHR();
            xhr.open('HEAD', window.location, false);
            xhr.send();
            headers = xhr.getAllResponseHeaders();
        }

        headers.Referer = document.referrer;
        headers["User-Agent"] = navigator.userAgent;
        return headers;
    };

    Raven.getSignature = function(message, timestamp, callback) {
        // bail if there is no signatureUrl set
        if (!globalOptions.signatureUrl) return callback();

        var xhr = getXHR(),
            body = 'message=' + encodeURIComponent(message) +
                   '&timestamp=' + encodeURIComponent(timestamp);
        xhr.open('POST', globalOptions.signatureUrl, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    callback(JSON.parse(xhr.responseText).signature);
                } else {
                    callback();
                }
            }
        };
        xhr.send(body);
    };

    Raven.getAuthHeader = function(signature, timestamp) {
        var header = "Sentry sentry_version=2.0, ";
        header += "sentry_timestamp=" + timestamp + ", ";
        header += "sentry_client=raven-js/" + self.VERSION;
        if (globalOptions.publicKey) {
            header += ", sentry_key=" + globalOptions.publicKey;
        }
        if (signature) {
            header += ", sentry_signature=" + signature;
        }
        return header;
    };

    function handleStackInfo(stackInfo, options) {
        var frames = [], i, j;
        for (i = 0, j = stackInfo.stack.length; i < j; i++) {
            // normalize the frames data
            var currentStack = stackInfo.stack[i],
                currentFrame = {
                    abs_path:   currentStack.url,
                    filename:   currentStack.url.split(/\/([^\/]+)$/)[1], // extract the filename
                    lineno:     currentStack.line,
                    'function': currentStack.func
                };

            if (currentStack.context) {
                // TraceKit provides 4 lines of context total.
                // The first two are lines before the current line.
                // The third is the offending line.
                // The last (4th) is the only line AFTER the context provided,
                //   so we have to manually wrap it in an array
                currentFrame.pre_context = currentStack.context.slice(0, 2);
                currentFrame.context_line = currentStack.context[2];
                currentFrame.post_context = [currentStack.context[3]];
            }

            frames[i] = currentFrame;
        }
        processException(
            stackInfo.message,
            stackInfo.url,
            stackInfo.lineno,
            frames,
            options
        );
    }

    Raven.captureException = function(e, options) {
        // I'm going to patch TraceKit to allow passing along arbitrary options
        // and get it picked up in the subscriber
        // TraceKit.report(e, options);
        TraceKit.report(e);
    };

    Raven.captureMessage = function(msg, options) {
        // Fire away!
        send(
            arrayMerge({
                'message': msg
            }, options)
        );
    };

    function processException(message, fileurl, lineno, frames, options) {
        var type, stacktrace, label, i, j;

        if (typeof(message) === 'object') {
            type = message.name;
            message = message.message;
        }

        for (i = 0, j = globalOptions.ignoreErrors.length; i < j; i++) {
            if (message === globalOptions.ignoreErrors[i]) {
                return;
            }
        }

        if (frames) {
            stacktrace = {"frames": frames};
            fileurl = fileurl || frames[0].filename;
        } else if (fileurl) {
            stacktrace = {
                "frames": [{
                    "filename": fileurl,
                    "lineno": lineno
                }]
            };
        }

        for (i = 0, j = globalOptions.ignoreUrls.length; i < j; i++) {
            if (globalOptions.ignoreUrls[i].test(fileurl)) {
                return;
            }
        }

        label = lineno ? message + " at " + lineno : message;

        // Fire away!
        send(
            arrayMerge({
                "sentry.interfaces.Exception": {
                    "type": type,
                    "value": message
                },
                "sentry.interfaces.Stacktrace": stacktrace,
                "culprit": fileurl,
                "message": label
            }, options)
        );
    }

    function arrayMerge(arr1, arr2) {
        if (typeof(arr2) === "undefined") {
            return arr1;
        }
        each(arr2, function(key, value){
            arr1[key] = value;
        });
        return arr1;
    }

/*
    Raven.chromeTraceback = function(e) {
        /*
         * First line is simply the repeated message:
         *   ReferenceError: aldfjalksdjf is not defined
         *
         * Following lines contain error context:
         *   at http://localhost:9000/1/group/306:41:5
         *
        var chunks, fn, filename, lineno, idx,
            traceback = [],
            lines = e.stack.split('\n');
        each(lines.slice(1), function(i, line) {
            // Trim the 'at ' from the beginning, and split by spaces
            line = Raven.trimString(line).slice(3);
            if (line === "unknown source") {
                return;  // Skip this one
            }
            chunks = Raven.chromeUrlRegex.exec(line);
            if (chunks){
                fn = chunks[1];
                filename = chunks[2];
                lineno = parseInt(chunks[3], 10);
            }else{
                fn = '';
                filename = line;
                lineno = -1;
                // some lines are just a filename with a line number and a char number, let's try and parse that
                idx = line.lastIndexOf(':');
                if (idx !== -1){
                    line = line.substring(0, idx);
                    idx = line.lastIndexOf(':');
                    if (idx !== -1){
                        filename = line.substring(0, idx);
                        lineno = parseInt(line.substring(idx + 1), 10);
                    }
                }
            }

            traceback.push({
                'function': fn,
                'filename': filename,
                'lineno': isNaN(lineno) ? null : lineno
            });
        });
        return traceback;
    };
*/

    function pad(n, amount) {
        var i,
            len = ('' + n).length;
        if (typeof(amount) === "undefined") {
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
            timestamp= new Date().getTime(),
            url = window.location.protocol + '//' + window.location.host + window.location.pathname,
            querystring = window.location.search.slice(1);  // Remove the ?

        data = arrayMerge({
            "project": globalOptions.projectId,
            "logger": globalOptions.logger,
            "site": globalOptions.site,
            "timestamp": new Date(),
            "sentry.interfaces.Http": {
                "url": url,
                "querystring": querystring,
                "headers": self.getHeaders()
            }
        }, data);

        if (typeof(globalOptions.dataCallback) === 'function') {
            data = globalOptions.dataCallback(data);
        }

        data.timestamp = dateToISOString(data.timestamp);

        encoded_msg = JSON.stringify(data);
        //console.log(data);
        self.getSignature(encoded_msg, timestamp, function(signature) {
            var header = self.getAuthHeader(signature, timestamp),
                xhr;
            each(globalOptions.servers, function (i, server) {
                xhr = getXHR();
                xhr.open('POST', server, true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                // We send both headers, since Authentication may be blocked,
                // and custom headers arent supported in IE9
                xhr.setRequestHeader('X-Sentry-Auth', header);
                xhr.setRequestHeader('Authentication', header);
                xhr.send(encoded_msg);
            });
        });
    }
})(window);
