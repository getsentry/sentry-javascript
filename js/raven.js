// Raven.js
//
// Originally based on the Arecibo JavaScript client.
// Requires either jQuery (>1.4.2) or Zepto.js.

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
        fetchHeaders: false,
        publicKey: null,
        secretKey: null,
        servers: [],
        projectId: 1,
        logger: 'javascript',
        site: null
    };

    Raven.config = function (data) {
        for (var k in data) {
            self.options[k] = data[k];
        }
    };

    Raven.parseUrl = function(url) {
        var url_parts = url.split('?');
        var querystring = url_parts[1];

        return {
            url: url_parts[0],
            querystring: url_parts[1]
        };
    };

    Raven.getHeaders = function() {
        if (self.options.fetchHeaders) {
            var req = new XMLHttpRequest();
            req.open('HEAD', document.location, false);
            req.send(null);
            headers = req.getAllResponseHeaders().toLowerCase();
        } else {
            headers = {
                "Referer": document.referrer,
                "User-Agent": navigator.userAgent
            };
        }
        return headers;
    };

    Raven.addEvent = function(elem, event, func) {
        if (elem.addEventListener) {
            elem.addEventListener(event, func, false);
            return true;
        } else if (elem.attachEvent) {
            var result = elem.attachEvent("on"+event, func);
            return result;
        }
        return false;
    };

    Raven.process = function(data) {
        data.project = self.options.projectId;
        data.logger = self.options.logger;
        data.site = self.options.site;

        var req = new XMLHttpRequest();
        // req.setRequestHeader('User-Agent', 'Sentry:JS/1.0');
        // req.setRequestHeader('Content-type', 'application/json');
        // req.setRequestHeader("X-Requested-With", "XMLHttpRequest");
        req.open('POST', self.options.server + '?project_id=' + self.options.projectId, false);
        req.send(JSON.stringify(data));
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
        var url = root.location.href;
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

        var urlparts = self.parseUrl(url);
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
                "url": urlparts.url,
                "querystring": urlparts.querystring,
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
            var url = root.location.href;
            var urlparts = self.parseUrl(url);
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
                    "url": urlparts.url,
                    "querystring": urlparts.querystring,
                    "headers": self.getHeaders()
                }
            };
            self.process(data);
        };
    };
}).call(this);