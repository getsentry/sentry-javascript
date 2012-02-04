$(document).ready(function() {

    module("Raven.captureException");
    
    test("should collect error information and report to Sentry", function() {
        try {
            varThatDoesNotExist++;
        } catch(err) {
            Raven.captureException(err);
        }
        
        data = JSON.parse($P.base64_decode(ajax_options.data.slice(8)));
        
        equal(data.culprit.slice(-12), 'exception.js',
              'the culprit should be the exception.js unit test file');
        equal(data.logger, 'javascript',
              'the logger should be the default value');
        notEqual(data.message.indexOf('varThatDoesNotExist'), -1,
                 'the offending variable name should show up in the message');
        equal(data['sentry.interfaces.Exception'].type, 'ReferenceError',
              'the error should be a ReferenceError');
    });
    
});
