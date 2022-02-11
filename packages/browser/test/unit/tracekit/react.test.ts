import { computeStackTrace } from '../../../src/tracekit';

describe('Tracekit - React Tests', () => {
  it('should correctly parse Invariant Violation errors and use framesToPop to drop info message', () => {
    const REACT_INVARIANT_VIOLATION_EXCEPTION = {
      framesToPop: 1,
      message:
        'Minified React error #31; visit https://reactjs.org/docs/error-decoder.html?invariant=31&args[]=object%20with%20keys%20%7B%7D&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings. ',
      name: 'Invariant Violation',
      stack: `Invariant Violation: Minified React error #31; visit https://reactjs.org/docs/error-decoder.html?invariant=31&args[]=object%20with%20keys%20%7B%7D&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
          at http://localhost:5000/static/js/foo.chunk.js:1:21738
          at a (http://localhost:5000/static/js/foo.chunk.js:1:21841)
          at ho (http://localhost:5000/static/js/foo.chunk.js:1:68735)
          at f (http://localhost:5000/:1:980)`,
    };

    const stacktrace = computeStackTrace(REACT_INVARIANT_VIOLATION_EXCEPTION);

    expect(stacktrace).toEqual({
      message:
        'Minified React error #31; visit https://reactjs.org/docs/error-decoder.html?invariant=31&args[]=object%20with%20keys%20%7B%7D&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings. ',
      name: 'Invariant Violation',
      stack: [
        { url: 'http://localhost:5000/static/js/foo.chunk.js', func: '?', line: 1, column: 21738 },
        { url: 'http://localhost:5000/static/js/foo.chunk.js', func: 'a', line: 1, column: 21841 },
        { url: 'http://localhost:5000/static/js/foo.chunk.js', func: 'ho', line: 1, column: 68735 },
        { url: 'http://localhost:5000/', func: 'f', line: 1, column: 980 },
      ],
    });
  });

  it('should correctly parse production errors and drop initial frame if its not relevant', () => {
    const REACT_PRODUCTION_ERROR = {
      message:
        'Minified React error #200; visit https://reactjs.org/docs/error-decoder.html?invariant=200 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
      name: 'Error',
      stack: `Error: Minified React error #200; visit https://reactjs.org/docs/error-decoder.html?invariant=200 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
        at http://localhost:5000/static/js/foo.chunk.js:1:21738
        at a (http://localhost:5000/static/js/foo.chunk.js:1:21841)
        at ho (http://localhost:5000/static/js/foo.chunk.js:1:68735)
        at f (http://localhost:5000/:1:980)`,
    };

    const stacktrace = computeStackTrace(REACT_PRODUCTION_ERROR);

    expect(stacktrace).toEqual({
      message:
        'Minified React error #200; visit https://reactjs.org/docs/error-decoder.html?invariant=200 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
      name: 'Error',
      stack: [
        { url: 'http://localhost:5000/static/js/foo.chunk.js', func: '?', line: 1, column: 21738 },
        { url: 'http://localhost:5000/static/js/foo.chunk.js', func: 'a', line: 1, column: 21841 },
        { url: 'http://localhost:5000/static/js/foo.chunk.js', func: 'ho', line: 1, column: 68735 },
        { url: 'http://localhost:5000/', func: 'f', line: 1, column: 980 },
      ],
    });
  });

  it('should not drop additional frame for production errors if framesToPop is still there', () => {
    const REACT_PRODUCTION_ERROR = {
      framesToPop: 1,
      message:
        'Minified React error #200; visit https://reactjs.org/docs/error-decoder.html?invariant=200 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
      name: 'Error',
      stack: `Error: Minified React error #200; visit https://reactjs.org/docs/error-decoder.html?invariant=200 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
        at http://localhost:5000/static/js/foo.chunk.js:1:21738
        at a (http://localhost:5000/static/js/foo.chunk.js:1:21841)
        at ho (http://localhost:5000/static/js/foo.chunk.js:1:68735)
        at f (http://localhost:5000/:1:980)`,
    };

    const stacktrace = computeStackTrace(REACT_PRODUCTION_ERROR);

    expect(stacktrace).toEqual({
      message:
        'Minified React error #200; visit https://reactjs.org/docs/error-decoder.html?invariant=200 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
      name: 'Error',
      stack: [
        { url: 'http://localhost:5000/static/js/foo.chunk.js', func: '?', line: 1, column: 21738 },
        { url: 'http://localhost:5000/static/js/foo.chunk.js', func: 'a', line: 1, column: 21841 },
        { url: 'http://localhost:5000/static/js/foo.chunk.js', func: 'ho', line: 1, column: 68735 },
        { url: 'http://localhost:5000/', func: 'f', line: 1, column: 980 },
      ],
    });
  });
});
