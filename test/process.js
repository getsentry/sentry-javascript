$(document).ready(function() {

    module("Raven.process");

    function parseAuthHeader(header) {
        var values = {};
        $.each(header.slice(7).split(', '), function(i, value) {
            values[value.split('=')[0]] = value.split('=')[1];
        });
        return values;
    }

    var message = "Once upon a midnight dreary",
        fileurl = 'http://edgarallen.poe/nevermore/',
        lineno = 12;

    test("should correctly capture the data", function() {
        Raven.process(message, fileurl, lineno, undefined, timestamp);
        var data = JSON.parse(ajax_calls[0].data);

        equal(data['culprit'], fileurl);
        equal(data['message'], message + " at " + lineno);
        equal(data['logger'], "javascript");
        equal(data['project'], 1);
        equal(data['site'], null);
    });

    test("should correctly generate Sentry headers", function() {
        Raven.process(message, fileurl, lineno, undefined, timestamp);
        var values = parseAuthHeader(ajax_calls[0].headers['X-Sentry-Auth']);

        equal(values.sentry_key, 'e89652ec30b94d9db6ea6f28580ab499',
              "sentry_key should match the public key");

        // import hmac, base64, hashlib
        // message = base64.b64encode('{"message":"Once upon a midnight dreary at 12","culprit":"http://edgarallen.poe/nevermore/","sentry.interfaces.Stacktrace":{"frames":[{"filename":"http://edgarallen.poe/nevermore/","lineno":12}]},"sentry.interfaces.Exception":{"value":"Once upon a midnight dreary"},"project":1,"logger":"javascript"}')
        // hmac.new('77ec8c99a8854256aa68ccb91dd9119d', '1328155597571 %s' % message, hashlib.sha1).hexdigest()
        // equal(values.sentry_signature, '184e18f4c15f84897f8b07810cf63e0c9b789f15',
        //       "sentry_signature should match a hash generated with python");
    });

	test("should hit an external url for signature if desired", function() {
		Raven.config({"signatureUrl": "/api/sign-error/"});
		Raven.process(message, fileurl, lineno, undefined, timestamp);

		// The first Ajax call in this case should be to the signature URL
		equal(ajax_calls[0].url, '/api/sign-error/');
		equal(ajax_calls[0].data.timestamp, timestamp);
		notEqual(ajax_calls[1].headers['X-Sentry-Auth'].indexOf('dummy-signature'), -1);
	});

	test("should omit 'at' if there is no line number provided", function() {
        Raven.process('ManuallyThrownError');

        var data = JSON.parse(ajax_calls[0].data);

        equal(data.message, 'ManuallyThrownError',
                 'the message should match');
    });

    test("should ignore errors passed in `ignoreErrors`", function() {
        Raven.process("Error to ignore");

        // Raven should bail before making an ajax call
        equal(ajax_calls.length, 0);
    });

    test("should ignore urls passed in `ignoreUrls`", function() {
        Raven.process("Test error", "https://ajax.googleapis.com/ajax/libs/jquery/1.8.1/jquery.min.js");

        // Raven should bail before making an ajax call
        equal(ajax_calls.length, 0);
    });

    test("should send a proper url", function() {
      Raven.process("Fail");

      var data = JSON.parse(ajax_calls[0].data);
      equal(data["sentry.interfaces.Http"].url.indexOf('undefined'), -1, "If the url contains the string 'undefined' it probably means there is an issue.");
    });

});
