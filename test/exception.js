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
        var mode, data, frame;
        
        try {
            giveMeAnError();
        } catch(err) {
            Raven.captureException(err);
            
            if (err.arguments && err.stack) {
    	        mode = 'chrome';
    		} else if (err.stack) {
    			mode = 'firefox';
    		} else {
    			mode = 'other';
    		}
        }

        data = JSON.parse($P.base64_decode(ajax_calls[0].data));

        equal(data.culprit.slice(-12), 'exception.js',
              'the culprit should be the exception.js unit test file');
        equal(data.logger, 'javascript',
              'the logger should be the default value');
        notEqual(data.message.indexOf('varThatDoesNotExist'), -1,
                 'the offending variable name should show up in the message');
        equal(data['sentry.interfaces.Exception'].type, 'ReferenceError',
              'the error should be a ReferenceError');
        
        if (mode !== 'other') {
            frame = data['sentry.interfaces.Stacktrace'].frames[0];
            equal(frame.function, 'outlandishClaim');
            equal(frame.lineno, '7');
            
            if (mode === 'firefox') {
                equal(frame.vars.arguments[0], '"I am Batman"');
                equal(frame.vars.arguments[1], '"Seriously"');
            }
            
            frame = data['sentry.interfaces.Stacktrace'].frames[1];
            equal(frame.function, 'giveMeAnError');
            equal(frame.lineno, '3');
        }
    });

    test("should have error message without line number", function() {
        Raven.captureException(new Error('ManuallyThrownError'));

        var data = JSON.parse($P.base64_decode(ajax_calls[0].data));

        equal(data.message, 'ManuallyThrownError',
                 'the message should match');
    });

});
