// Raven.js
//
// Originally based on the Arecibo JavaScript client.
//
// Requires:
//     * Either jQuery (>1.5) or Zepto.js.
//     * base64_encode from php.js (included in the vendor folder)
//     * crypto-sha1-hmac from Crypto-JS (included in the vendor folder)

(function(){
    // Save a reference to the global object (`window` in the browser, `global`
    // on the server).
    var root = this;
    
    var Raven;
    Raven = root.Raven = {};

    var self = Raven;
    
    Raven.VERSION = '0.1';
    
    // jQuery, Zepto, or Ender owns the `$` variable.
    var $ = root.jQuery || root.Zepto || root.ender;

    Raven.loaded = false;
    Raven.options = {
        secretKey: undefined,  // The global key if not using project auth
        publicKey: undefined,  // Leave as undefined if not using project auth
        servers: [],
        projectId: 1,
        logger: 'javascript',
        site: undefined,
        fetchHeaders: false,  // Does not work for cross-domain requests
        noHeaders: false  // Primarily for testing
    };

    Raven.config = function(config) {
        $.each(config, function(i, option) {
            self.options[i] = option;
        });
    };

    Raven.getHeaders = function() {
        if (!self.options.noHeaders) {
            var headers = "";
        
            if (self.options.fetchHeaders) {
                headers = $.ajax({type: 'HEAD', url: root.location, async: false})
                           .getAllResponseHeaders();
            }
        
            headers += "Referer: " + document.referrer + "\n";
            headers += "User-Agent: " + navigator.userAgent + "\n";
            return headers;
        }
    };
    
    Raven.getSignature = function(message, timestamp) {
        return Crypto.HMAC(Crypto.SHA1, timestamp + " " + message,
                           self.options.secretKey);
    };
    
    Raven.getAuthHeader = function(signature, timestamp) {
        var header = "Sentry sentry_version=2.0, ";
        header += "sentry_timestamp=" + timestamp + ", ";
        header += "sentry_signature=" + signature + ", ";
        header += "sentry_client=raven-js/" + self.VERSION;
        if (self.options.publicKey) {
            header += ", sentry_key=" + self.options.publicKey;
        }
        return header
    };

    Raven.parseTraceback = function(tb) {
        // first line is simply the repeated message:
        // ReferenceError: aldfjalksdjf is not defined

        // following lines (in Chrome at least) contain
        // a line of context
        //     at http://localhost:9000/1/group/306:41:5
        var stack = [],
            lines = tb.split('\n');
        $.each(lines.slice(1), function(i, line) {
            var chunks = line.split(':'),
                lineno = chunks.slice(-2)[0],
                filename = chunks.slice(0, -2).join(':').split(' at ')[1];
            stack.push({
                'lineno': lineno,
                'filename': filename
            });
        });
        return stack;
    };

    Raven.captureException = function(e) {
        var lineno, traceback, fileurl;

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
        
        self.process(e, fileurl, lineno, e.stack);
    };
    
    Raven.process = function(message, fileurl, lineno, stack, timestamp) {
        var label, traceback, stacktrace, data, encoded_msg, signature, type,
            url = root.location.pathname,
            querystring = root.location.search.slice(1);  // Remove the ?
        
        if (typeof(message) === 'object') {
            type = message.name;
            message = message.message;
        }
        
        if (lineno) {
            label = message + " at " + lineno;
        }
        
        if (stack) {
            try {
                traceback = self.parseTraceback(stack);
            } catch (err) {}
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
        
        data = {
            "message": label,
            "culprit": fileurl,
            "sentry.interfaces.Stacktrace": stacktrace,
            "sentry.interfaces.Exception": {
                "type": type,
                "value": message
            },
            "sentry.interfaces.Http": {
                "url": url,
                "querystring": querystring,
                "headers": self.getHeaders()
            },
            "project": self.options.projectId,
            "logger": self.options.logger,
            "site": self.options.site
        };
        
        timestamp = timestamp || (new Date).getTime();
        encoded_msg = "message=" + base64_encode(JSON.stringify(data));
        signature = self.getSignature(encoded_msg, timestamp);
        
        $.each(self.options.servers, function (i, server) {
            $.ajax({
                type: 'POST',
                url: server,
                data: encoded_msg,
                headers: {
                    'X-Sentry-Auth': self.getAuthHeader(signature, timestamp)
                }
            });
        });
    };
}).call(this);