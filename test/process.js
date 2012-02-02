$(document).ready(function() {

    module("Raven.process");
        
    function parseAuthHeader(header) {
        var values = {};
        $.each(header.slice(7).split(', '), function(i, value) {
            values[value.split('=')[0]] = value.split('=')[1];
        });
        return values;
    };
    
    var message = "Once upon a midnight dreary",
        fileurl = 'http://edgarallen.poe/nevermore/',
        lineno = 12;    
    
    test("should correctly base64 encode the data", function() {
        Raven.process(message, fileurl, lineno, undefined, timestamp);
        var decoded_data = JSON.parse(base64_decode(ajax_options.data.slice(8)));
        
        equal(decoded_data['culprit'], fileurl);
        equal(decoded_data['message'], message + " at " + lineno);
        equal(decoded_data['logger'], "javascript");
        equal(decoded_data['project'], 1);
        equal(decoded_data['site'], null);
    });
    
    test("should correctly generate Sentry headers", function() {
        Raven.process(message, fileurl, lineno, undefined, timestamp);
        var values = parseAuthHeader(ajax_options.headers['X-Sentry-Auth']);
        
        equal(values.sentry_key, 'e89652ec30b94d9db6ea6f28580ab499',
              "sentry_key should match the public key");
        
        // import hmac, base64, hashlib
        // message = "message=" + base64.b64encode('{"message":"Once upon a midnight dreary at 12","culprit":"http://edgarallen.poe/nevermore/","sentry.interfaces.Stacktrace":{"frames":[{"filename":"http://edgarallen.poe/nevermore/","lineno":12}]},"sentry.interfaces.Exception":{"value":"Once upon a midnight dreary"},"project":1,"logger":"javascript"}')
        // hmac.new('77ec8c99a8854256aa68ccb91dd9119d', '1328155597571 %s' % message, hashlib.sha1).hexdigest()
        equal(values.sentry_signature, '4799ab65ff3052aa8768987d918014c6d40f75d0',
              "sentry_signature should match one generated with python");
    });

});
