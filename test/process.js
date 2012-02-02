$(document).ready(function() {

    module("Raven.process");
    
    Raven.config({
        publicKey: 'e89652ec30b94d9db6ea6f28580ab499',
        secretKey: '77ec8c99a8854256aa68ccb91dd9119d',
        servers: ['/api/store/']
    });
    
    var data = {
        "Once": "upon a midnight dreary",
        "while": "I pondered weak and weary"
    }
    var timestamp = 1328155597571;
    
    // Monkey-patch jQuery.ajax with a mock function
    var ajax_options;
    $.ajax = function(options) {
        ajax_options = options;
    };
    
    var parseAuthHeader = function(header) {
        var values = {};
        $.each(header.slice(7).split(', '), function(i, value) {
            values[value.split('=')[0]] = value.split('=')[1];
        });
        return values;
    };
    
    test("should correctly base64 encode the data", function() {
        Raven.process(data, timestamp);
        var decoded_data = JSON.parse(base64_decode(ajax_options.data));
        
        equal(decoded_data['Once'], "upon a midnight dreary");
        equal(decoded_data['while'], "I pondered weak and weary")
        equal(decoded_data['logger'], "javascript");
        equal(decoded_data['project'], 1);
        equal(decoded_data['site'], null);
    });
    
    test("should correctly generate Sentry headers", function() {
        Raven.process(data, timestamp);
        var values = parseAuthHeader(ajax_options.headers['X-Sentry-Auth']);
        
        equal(values.sentry_key, 'e89652ec30b94d9db6ea6f28580ab499',
              "sentry_key should match the public key");
        
        // message = base64.b64encode('{"Once":"upon a midnight dreary","while":"I pondered weak and weary","project":1,"logger":"javascript","site":null}')
        // hmac.new('77ec8c99a8854256aa68ccb91dd9119d', '1328155597571 %s' % message, hashlib.sha1).hexdigest()
        equal(values.sentry_signature, 'a3dd0a3d02661040268aa81f99a3dcf83ee22e71',
              "sentry_signature should match one generated with python");
    });

});