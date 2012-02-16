$(document).ready(function() {

    module("Raven.captureException");

    test("should collect error information and report to Sentry", function() {
        try {
            varThatDoesNotExist++;
        } catch(err) {
            Raven.captureException(err);
        }

        var data = JSON.parse($P.base64_decode(ajax_calls[0].data));

        equal(data.culprit.slice(-12), 'exception.js',
              'the culprit should be the exception.js unit test file');
        equal(data.logger, 'javascript',
              'the logger should be the default value');
        notEqual(data.message.indexOf('varThatDoesNotExist'), -1,
                 'the offending variable name should show up in the message');
        equal(data['sentry.interfaces.Exception'].type, 'ReferenceError',
              'the error should be a ReferenceError');
    });

    test("should have error message without line number", function() {
        Raven.captureException(new Error('ManuallyThrownError'));

        var data = JSON.parse($P.base64_decode(ajax_calls[0].data));

        equal(data.message, 'ManuallyThrownError',
                 'the message should match');
    });

});
