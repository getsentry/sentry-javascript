// Functions to test stacktraces
function giveMeAnError() {
    outlandishClaim('I am Batman', 'Seriously');
}

function outlandishClaim(arg1, arg2) {
    varThatDoesNotExist++;
}



$(document).ready(function() {

    module("Raven.captureException");

    test("should collect error information and report to Sentry", function() {
        var isSupported, data, frame, caughtErr;

        try {
            giveMeAnError();
        } catch(err) {
            caughtErr = err;
            Raven.captureException(err);

            if (err.stack) {
                isSupported = true;
            } else {
                isSupported = false;
            }
        }

        equal(ajax_calls.length, 1);

        data = JSON.parse(ajax_calls[0].data);

        equal(data.logger, 'javascript',
              'the logger should be the default value');
        notEqual(data.message.indexOf('varThatDoesNotExist'), -1,
                 'the offending variable name should show up in the message');
        equal(data['sentry.interfaces.Exception'].type, 'ReferenceError',
              'the error should be a ReferenceError');

        if (isSupported) {
            equal(data.culprit.slice(-12), 'exception.js',
              'the culprit should be the exception.js unit test file');
            
            frame = data['sentry.interfaces.Stacktrace'].frames[0];
            equal(frame["function"], 'outlandishClaim');
            equal(frame.lineno, '7');

            // if the browser provides the arguments in the error
            // verify they were parsed
            if (caughtErr.stack.indexOf("I am Batman") !== -1) {
                equal(frame.vars["arguments"][0], '"I am Batman"');
                equal(frame.vars["arguments"][1], '"Seriously"');
            }

            frame = data['sentry.interfaces.Stacktrace'].frames[1];
            equal(frame["function"], 'giveMeAnError');
            equal(frame.lineno, '3');
        }
    });

});
