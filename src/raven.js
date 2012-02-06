// Raven.js
//
// Originally based on the Arecibo JavaScript client.
//
// Requires:
//     * Either jQuery (>1.5) or Zepto.js.
//     * base64_encode/decode from php.js (included in the vendor folder)
//     * crypto-sha1-hmac from Crypto-JS (included in the vendor folder)

(function(){
    // Save a reference to the global object (`window` in the browser, `global`
    // on the server).
    var root = this;
    
    var Raven;
    Raven = root.Raven = {};

    var self = Raven;
    
    Raven.VERSION = '@VERSION';
    
    // jQuery, Zepto, or Ender owns the `$` variable.
    var $ = root.jQuery || root.Zepto || root.ender;

	// php.js owns $P, for base64 encoding
	var $P = new PHP_JS();

    Raven.loaded = false;
    Raven.options = {
        secretKey: undefined,  // The global key if not using project auth
        publicKey: undefined,  // Leave as undefined if not using project auth
        servers: [],
        projectId: 1,
        logger: 'javascript',
        site: undefined,
		signatureUrl: undefined,
        fetchHeaders: false,  // Generates a synchronous request to your server
        testMode: false  // Disables some things that randomize the signature
    };

    Raven.config = function(config) {
		if (typeof(config) === "string") {
			config = JSON.parse($P.base64_decode(config));
		}
        $.each(config, function(i, option) {
            self.options[i] = option;
        });
		
    };

    Raven.getHeaders = function() {
        var headers = {};
    
        if (self.options.fetchHeaders) {
            headers = $.ajax({type: 'HEAD', url: root.location, async: false})
                       .getAllResponseHeaders();
        }
    
        headers["Referer"] = document.referrer;
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
		if (self.options.signatureUrl) {
			$.post(self.options.signatureUrl, {
				message: message, timestamp: timestamp
			}, function(data) {
				callback(data.signature);
			});
		} else {
			var signature = Crypto.HMAC(Crypto.SHA1, timestamp + " " + message,
	                           	    self.options.secretKey);
			callback(signature);
		}
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
        var label, traceback, stacktrace, data, encoded_msg, type,
            url = root.location.origin + root.location.pathname,
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
            "project": self.options.projectId,
            "logger": self.options.logger,
            "site": self.options.site
        };
        
        if (!self.options.testMode) {
            data["sentry.interfaces.Http"] = {
                "url": url,
                "querystring": querystring,
                "headers": self.getHeaders()
            };
        }
        
        timestamp = timestamp || (new Date).getTime();
        encoded_msg = $P.base64_encode(JSON.stringify(data));
        self.getSignature(encoded_msg, timestamp, function(signature) {
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
		});
    };
}).call(this);
