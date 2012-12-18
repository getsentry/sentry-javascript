// Functions to test stacktraces
function giveMeAnError() {
    outlandishClaim('I am Batman', 'Seriously');
}

function outlandishClaim(arg1, arg2) {
    varThatDoesNotExist++;
}



$(document).ready(function() {

    var fakeServer;

    module("Raven.captureException", {
        setup: function() {
            fakeServer = sinon.fakeServer.create();
        },

        teardown: function() {
            fakeServer.restore();
        }
    });

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

        equal(fakeServer.requests.length, 1);

        data = JSON.parse(fakeServer.requests[0].requestBody);

        equal(data.logger, 'javascript',
              'the logger should be the default value');
        equal(data.message.indexOf('varThatDoesNotExist') !== -1, true,
                 'the offending variable name should show up in the message');
        equal(data['sentry.interfaces.Exception'].type, 'ReferenceError',
              'the error should be a ReferenceError');

        if (isSupported) {
            equal(data.culprit.slice(-12), 'exception.js',
              'the culprit should be the exception.js unit test file');

            frame = data['sentry.interfaces.Stacktrace'].frames[0];
            equal(frame["function"], 'outlandishClaim');
            equal(frame.lineno, '7',
                'the frame has the correct lineno');

            // if the browser provides the arguments in the error
            // verify they were parsed
            if (caughtErr.stack.indexOf("I am Batman") !== -1) {
                equal(frame.vars["arguments"][0], '"I am Batman"');
                equal(frame.vars["arguments"][1], '"Seriously"');
            }

            frame = data['sentry.interfaces.Stacktrace'].frames[1];
            equal(frame["function"], 'giveMeAnError');
            equal(frame.lineno, '3',
                'the frame has the correct lineno');
        }
    });

});
