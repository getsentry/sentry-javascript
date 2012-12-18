// Raven.js
//
// Originally based on the Arecibo JavaScript client.
//
// Requires:
//     * parseUri (included in the full and minified distribution files)

(function(){
    // Save a reference to the global object (`window` in the browser, `global`
    // on the server).
    "use strict";

    var root = this;

    var Raven;
    root.Raven = Raven = {};

    var self = Raven;
    var isSafari = Object.prototype.toString.call(window.HTMLElement).indexOf('Constructor') > 0;

    Raven.VERSION = '@VERSION';

    // Stub our own
    var $ = {
        each: function(obj, callback) {
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
        },

        getXHR: function() {
            if (window.XMLHttpRequest) {
                return new window.XMLHttpRequest();
            } else if (window.ActiveXObject) { // IE
                return new window.ActiveXObject("MSXML2.XMLHTTP.3.0");
            }
        }
    };

    Raven.options = {
        secretKey: undefined,  // The global key if not using project auth
        publicKey: undefined,  // Leave as undefined if not using project auth
        servers: [],
        projectId: 1,
        logger: 'javascript',
        site: undefined,
        dataCallback: null,
        signatureUrl: undefined,
        fetchHeaders: false,  // Generates a synchronous request to your server
        testMode: false,  // Disables some things that randomize the signature
        ignoreErrors: [],
        ignoreUrls: []
    };

    Raven.funcNameRE = /function\s*([\w\-$]+)?\s*\(/i;

    Raven.config = function(config, bind) {
        var servers = [];

        if (typeof(config) === "string") {
            if (config.indexOf('http') === 0) {
                // new-style DSN configuration
                config = Raven.parseDSN(config);
            } else {
                throw "Base64 encoded config is no longer supported - use DSN";
            }
        }

        $.each(config, function(key, option) {
            self.options[key] = option;
        });

        // Expand server base URLs into API URLs
        $.each(self.options.servers, function(i, server) {
            // Add a trailing slash if one isn't provided
            if (server.slice(-1) !== '/') {
                server += '/';
            }
            servers.push(server + 'api/' + self.options.projectId + '/store/');
        });
        self.options.servers = servers;

        bind && window.onError = Raven.onError(window.onError);
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

    Raven.getHeaders = function() {
        var headers = {};

        if (self.options.fetchHeaders && !self.options.testMode) {
            var xhr = $.getXHR();
            xhr.open('HEAD', root.location, false);
            xhr.send();
            headers = xhr.getAllResponseHeaders();
        }

        headers.Referer = document.referrer;
        headers["User-Agent"] = navigator.userAgent;
        return headers;
    };

    Raven.parseHeaders = function(headers_string) {
        /*
         * Parse the header string returned from getAllResponseHeaders
         */
        var headers = {};
        $.each(headers_string.split('\n'), function(i, header) {
            var name = header.slice(0, header.indexOf(':')),
                value = header.slice(header.indexOf(':') + 2);
            headers[name] = value;
        });
        return headers;
    };

    Raven.getSignature = function(message, timestamp, callback) {
        // bail if there is no signatureUrl set
        if (!self.options.signatureUrl) return callback();

        var xhr = $.getXHR(),
            body = 'message=' + encodeURIComponent(message) +
                   '&timestamp=' + encodeURIComponent(timestamp);
        xhr.open('POST', self.options.signatureUrl, true);
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

    Raven.onError = function(oldOnError) {
        return function() {
            Raven.process.apply(null, arguments);

            if (oldOnError) {
                return oldOnError.apply(null, arguments);
            }

            // apparently onerror handlers should return false.
            // I don't know why.
            return false;
        };
    };

    Raven.getAuthHeader = function(signature, timestamp) {
        var header = "Sentry sentry_version=2.0, ";
        header += "sentry_timestamp=" + timestamp + ", ";
        header += "sentry_client=raven-js/" + self.VERSION;
        if (self.options.publicKey) {
            header += ", sentry_key=" + self.options.publicKey;
        }
        if (signature) {
            header += ", sentry_signature=" + signature;
        }
        return header;
    };

    Raven.captureException = function(e, options) {
        var label, lineno, fileurl, traceback;

        if (e.line) {  // WebKit
            lineno = e.line;
        } else if (e.lineNumber) {  // Mozilla
            lineno = e.lineNumber;
        }

        if (e.sourceURL) {  // Webkit
            fileurl = e.sourceURL;
        } else if (e.fileName) {  // Mozilla
            fileurl = e.fileName;
        }

        if (e["arguments"] && e.stack) {
            traceback = self.chromeTraceback(e);
        } else if (e.stack) {
            // Detect edge cases where Chrome doesn't have 'arguments'
            if (e.stack.indexOf('@') == -1) {
                traceback = self.chromeTraceback(e);
            } else {
                traceback = self.firefoxOrSafariTraceback(e);
            }
        } else {
            traceback = [{"filename": fileurl, "lineno": lineno}];
            traceback = traceback.concat(self.otherTraceback(Raven.captureException));
        }

        self.process(e, fileurl, lineno, traceback, options);
    };

    Raven.captureMessage = function(msg, options) {
        var data = self.arrayMerge({
            'message': msg
        }, options);

        self.send(data);
    };

    Raven.process = function(message, fileurl, lineno, traceback, options) {
        var type, stacktrace, label, data, i, j;

        if (typeof(message) === 'object') {
            type = message.name;
            message = message.message;
        }

        for (i = 0, j = self.options.ignoreErrors.length; i < j; i++) {
            if (message === self.options.ignoreErrors[i]) {
                return;
            }
        }

        if (traceback) {
            stacktrace = {"frames": traceback};
            fileurl = fileurl || traceback[0].filename;
        } else if (fileurl) {
            stacktrace = {
                "frames": [{
                    "filename": fileurl,
                    "lineno": lineno
                }]
            };
        }

        for (i = 0, j = self.options.ignoreUrls.length; i < j; i++) {
            if (self.options.ignoreUrls[i].test(fileurl)) {
                return;
            }
        }

        label = lineno ? message + " at " + lineno : message;

        data = self.arrayMerge({
            "sentry.interfaces.Exception": {
                "type": type,
                "value": message
            },
            "sentry.interfaces.Stacktrace": stacktrace,
            "culprit": fileurl,
            "message": label
        }, options);

        self.send(data);
    };

    Raven.arrayMerge = function(arr1, arr2) {
        if (typeof(arr2) === "undefined") {
            return arr1;
        }
        $.each(arr2, function(key, value){
            arr1[key] = value;
        });
        return arr1;
    };

    Raven.trimString = function(str) {
        return str.replace(/^\s+|\s+$/g, "");
    };

    Raven.chromeUrlRegex = /([\w\. ]+)\s+\((.*):(\d+):\d+\)$/;

    Raven.chromeTraceback = function(e) {
        /*
         * First line is simply the repeated message:
         *   ReferenceError: aldfjalksdjf is not defined
         *
         * Following lines contain error context:
         *   at http://localhost:9000/1/group/306:41:5
         */
        var chunks, fn, filename, lineno, idx,
            traceback = [],
            lines = e.stack.split('\n');
        $.each(lines.slice(1), function(i, line) {
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

    Raven.firefoxOrSafariTraceback = function(e) {
        /*
         * Each line is a function with args and a filename, separated by an ampersand.
         *   unsubstantiatedClaim("I am Batman")@http://raven-js.com/test/exception.js:7
         *
         * Anonymous functions are presented without a name, but including args.
         *   (66)@http://raven-js.com/test/vendor/qunit.js:418
         *
         */
        var chunks, fn, args, filename, lineno,
            traceback = [],
            lines = e.stack.split('\n');
        $.each(lines, function(i, line) {
            if (line) {
                chunks = line.split('@');
                if (chunks[0]) {
                    fn = chunks[0].split('(');

                    if (fn.length > 1 && fn[1] != ')') {
                        args = fn[1].slice(0, -1).split(',');
                    } else {
                        args = undefined;
                    }

                    if (fn[0]) {
                        fn = fn[0];
                    } else {
                        fn = '(unknown)';
                    }
                } else {
                    fn = '(unknown)';
                }

                if (chunks.length > 1) {
                    filename = chunks[1].split(':');
                    lineno = parseInt(filename.slice(-1)[0], 10);
                    if (isSafari) {
                        lineno += 1; // no idea
                    }
                    filename = filename.slice(0, -1).join(':');
                } else if (chunks[0] == '[native code]') {
                    fn = '(unknown)';
                    filename = '[native code]';
                    lineno = 0;
                    args = undefined;
                }

                traceback.push({
                    'function': fn,
                    'filename': filename,
                    'lineno': isNaN(lineno) ? null : lineno,
                    'vars': {'arguments': args}
                });
            }
        });
        return traceback;
    };

    Raven.otherTraceback = function(callee) {
        /*
         * Generates best-efforts tracebacks for other browsers, such as Safari
         * or IE.
         */
        var fn, args,
            ANON = '<anonymous>',
            traceback = [],
            max = 9;
        while (callee && traceback.length < max) {
            fn = callee.name || (self.funcNameRE.test(callee.toString()) ? RegExp.$1 || ANON : ANON);
            if (callee["arguments"]) {
                args = self.stringifyArguments(callee["arguments"]);
            } else {
                args = undefined;
            }
            traceback.push({
                'filename': '(unknown source)',
                'lineno': null,
                'function': fn,
                'post_context': callee.toString().split('\n'),
                'vars': {'arguments': args}
            });
            callee = callee.caller;
        }
        return traceback;
    };

    Raven.stringifyArguments = function(args) {
        /*
         * Converts a callee's arguments to strings
         */
        var fn,
            self = this,
            UNKNOWN = '<unknown>',
            results = [];

        $.each(args, function(i, arg) {
            if (arg === undefined) {
                results.push('undefined');
            } else if (arg === null) {
                results.push('null');
            } else if (arg instanceof Array) {
                results.push(self.stringifyArguments(arg));
            } else if (arg.constructor) {
                fn = arg.constructor.name || (self.funcNameRE.test(arg.constructor.toString()) ? RegExp.$1 || UNKNOWN : UNKNOWN);
                if (fn == 'String') {
                    results.push('"' + arg + '"');
                } else if (fn == 'Number' || fn == 'Date') {
                    results.push(arg);
                } else if (fn == 'Boolean') {
                    results.push(arg ? 'true' : 'false');
                } else {
                    results.push(fn);
                }
            } else {
                results.push(UNKNOWN);
            }
        });

        return results;
    };

    Raven.pad = function(n, amount) {
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
    };

    Raven.dateToISOString = function(date) {
        if (Date.prototype.toISOString) {
            return date.toISOString();
        }

        return date.getUTCFullYear() + '-' +
            self.pad(date.getUTCMonth() + 1) + '-' +
            self.pad(date.getUTCDate()) + 'T' +
            self.pad(date.getUTCHours()) + ':' +
            self.pad(date.getUTCMinutes()) + ':' +
            self.pad(date.getUTCSeconds()) + '.' +
            self.pad(date.getUTCMilliseconds(), 3) + 'Z';
    };

    Raven.send = function(data) {
        var encoded_msg,
            timestamp= new Date().getTime(),
            url = root.location.protocol + '//' + root.location.host + root.location.pathname,
            querystring = root.location.search.slice(1);  // Remove the ?

        data = self.arrayMerge({
            "project": self.options.projectId,
            "logger": self.options.logger,
            "site": self.options.site,
            "timestamp": new Date(),
            "sentry.interfaces.Http": {
                "url": url,
                "querystring": querystring,
                "headers": self.getHeaders()
            }
        }, data);

        if (typeof(self.options.dataCallback) == 'function') {
            data = self.options.dataCallback(data);
        }

        data.timestamp = self.dateToISOString(data.timestamp);

        encoded_msg = JSON.stringify(data);
        self.getSignature(encoded_msg, timestamp, function(signature) {
            var header = self.getAuthHeader(signature, timestamp),
                xhr;
            $.each(self.options.servers, function (i, server) {
                xhr = $.getXHR();
                xhr.open('POST', server, true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                // We send both headers, since Authentication may be blocked,
                // and custom headers arent supported in IE9
                xhr.setRequestHeader('X-Sentry-Auth', header);
                xhr.setRequestHeader('Authentication', header);
                xhr.send(encoded_msg);
            });
        });
    };
}).call(this);
