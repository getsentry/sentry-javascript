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
        fetchHeaders: false,  // Does not work for cross-domain requests
        publicKey: null,  // Leave as null if not using project auth
        secretKey: null,  // The global superuser key if not using project auth
        servers: [],
        projectId: 1,
        logger: 'javascript',
        site: null
    };

    Raven.config = function(config) {
        $.each(config, function(i, option) {
            self.options[i] = option;
        });
    };

    Raven.getHeaders = function() {
        var headers = "";
        
        if (self.options.fetchHeaders) {
            headers = $.ajax({type: 'HEAD', url: root.location, async: false})
                       .getAllResponseHeaders();
        }
        
        headers += "Referer: " + document.referrer + "\n";
        headers += "User-Agent: " + navigator.userAgent + "\n";
        return headers;
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

    Raven.process = function(data, timestamp) {
        data.project = self.options.projectId;
        data.logger = self.options.logger;
        data.site = self.options.site;
        
        timestamp = timestamp || (new Date).getTime();
        var message = base64_encode(JSON.stringify(data));
        var signature = self.getSignature(message, timestamp);
        
        $.each(self.options.servers, function (i, server) {
            $.ajax({
                type: 'POST',
                url: server,
                data: message,
                headers: {
                    'X-Sentry-Auth': self.getAuthHeader(signature, timestamp)
                }
            });
        });
    };

    Raven.parseTraceback = function(tb) {
        // first line is simply the repeated message:
        // ReferenceError: aldfjalksdjf is not defined

        // following lines (in Chrome at least) contain
        // a line of context
        //     at http://localhost:9000/1/group/306:41:5
        var stack = [];
        var lines = tb.split('\n');
        for (var i=1, line; (line = lines[i]); i++) {
            var chunks = line.split(':');
            var lineno = chunks.slice(-2)[0];
            var filename = chunks.slice(0, -2).join(':').split(' at ')[1];
            stack.push({
                'lineno': lineno,
                'filename': filename
            });
        }
        return stack;
    };

    Raven.captureException = function(e) {
        var lineno;
        var url = root.location.pathname;
        var querystring = root.location.search.slice(1);
        var traceback;
        var stack;
        var headers;
        var fileurl;

        if (e.line) { // WebKit
            lineno = e.line;
        } else if (e.lineNumber) { // Mozilla
            lineno = e.lineNumber;
        }

        if (e.sourceURL) { // Webkit
            fileurl = e.sourceURL;
        } else if (e.fileName) { // Mozilla
            fileurl = e.fileName;
        }
        if (e.stack) {
            try {
                traceback = self.parseTraceback(e.stack);
            } catch (ex) {

            }
        }

        var label = e.toString();
        if (lineno) {
            label = label + " at " + lineno;
        }

        if (traceback) {
            stack = {
                "frames": traceback
            };
            fileurl = traceback[0].filename;
        } else if (fileurl) {
            stack = {
                "frames": [
                    {
                        "filename": fileurl,
                        "lineno": lineno
                    }
                ]
            };
        }

        var data = {
            "message": label,
            "culprit": fileurl || undefined,
            "sentry.interfaces.Stacktrace": stack || undefined,
            "sentry.interfaces.Exception": {
                "type": e.name,
                "value": e.message
            },
            "sentry.interfaces.Http": {
                "url": url,
                "querystring": querystring,
                "headers": self.getHeaders()
            }
        };

        self.process(data);
    };

    Raven.registerGlobalHandler = function() {
        /*
            NOTE: window.onerror support was added to WebKit in 2011 and will
            not be available in older versions. See:
                https://bugs.webkit.org/show_bug.cgi?id=8519
                http://code.google.com/p/chromium/issues/detail?id=7771
        */

        root.onerror = function(message, fileurl, lineno, stack) {
            var url = root.location.pathname;
            var querystring = root.location.search.slice(1);
            var label = message + ' at line ' + lineno;
            var data = {
                "message": label,
                "culprit": fileurl,
                "sentry.interfaces.Stacktrace": {
                    "frames": [
                        {
                            "filename": fileurl,
                            "lineno": lineno
                        }
                    ]
                },
                "sentry.interfaces.Exception": {
                    "value": message
                },
                "sentry.interfaces.Http": {
                    "url": url,
                    "querystring": querystring,
                    "headers": self.getHeaders()
                }
            };
            self.process(data);
        };
    };
}).call(this);