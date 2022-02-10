import { computeStackTrace } from '../../../src/tracekit';

describe('Tracekit - Firefox Tests', () => {
  it('should parse Firefox 3 error', () => {
    const FIREFOX_3 = {
      fileName: 'http://127.0.0.1:8000/js/stacktrace.js',
      lineNumber: 44,
      message: 'this.undef is not a function',
      name: 'TypeError',
      stack:
        '()@http://127.0.0.1:8000/js/stacktrace.js:44\n' +
        '(null)@http://127.0.0.1:8000/js/stacktrace.js:31\n' +
        'printStackTrace()@http://127.0.0.1:8000/js/stacktrace.js:18\n' +
        'bar(1)@http://127.0.0.1:8000/js/file.js:13\n' +
        'bar(2)@http://127.0.0.1:8000/js/file.js:16\n' +
        'foo()@http://127.0.0.1:8000/js/file.js:20\n' +
        '@http://127.0.0.1:8000/js/file.js:24\n' +
        '',
    };

    const stackFrames = computeStackTrace(FIREFOX_3);

    expect(stackFrames).toEqual({
      message: 'this.undef is not a function',
      name: 'TypeError',
      stack: [
        { url: 'http://127.0.0.1:8000/js/stacktrace.js', func: '?', line: 44, column: null },
        { url: 'http://127.0.0.1:8000/js/stacktrace.js', func: '?', line: 31, column: null },
        { url: 'http://127.0.0.1:8000/js/stacktrace.js', func: 'printStackTrace', line: 18, column: null },
        { url: 'http://127.0.0.1:8000/js/file.js', func: 'bar', line: 13, column: null },
        { url: 'http://127.0.0.1:8000/js/file.js', func: 'bar', line: 16, column: null },
        { url: 'http://127.0.0.1:8000/js/file.js', func: 'foo', line: 20, column: null },
        { url: 'http://127.0.0.1:8000/js/file.js', func: '?', line: 24, column: null },
      ],
    });
  });

  it('should parse Firefox 7 error', () => {
    const FIREFOX_7 = {
      name: 'foo',
      message: 'bar',
      fileName: 'file:///G:/js/stacktrace.js',
      lineNumber: 44,
      stack:
        '()@file:///G:/js/stacktrace.js:44\n' +
        '(null)@file:///G:/js/stacktrace.js:31\n' +
        'printStackTrace()@file:///G:/js/stacktrace.js:18\n' +
        'bar(1)@file:///G:/js/file.js:13\n' +
        'bar(2)@file:///G:/js/file.js:16\n' +
        'foo()@file:///G:/js/file.js:20\n' +
        '@file:///G:/js/file.js:24\n' +
        '',
    };

    const stackFrames = computeStackTrace(FIREFOX_7);

    expect(stackFrames).toEqual({
      message: 'bar',
      name: 'foo',
      stack: [
        { url: 'file:///G:/js/stacktrace.js', func: '?', line: 44, column: null },
        { url: 'file:///G:/js/stacktrace.js', func: '?', line: 31, column: null },
        { url: 'file:///G:/js/stacktrace.js', func: 'printStackTrace', line: 18, column: null },
        { url: 'file:///G:/js/file.js', func: 'bar', line: 13, column: null },
        { url: 'file:///G:/js/file.js', func: 'bar', line: 16, column: null },
        { url: 'file:///G:/js/file.js', func: 'foo', line: 20, column: null },
        { url: 'file:///G:/js/file.js', func: '?', line: 24, column: null },
      ],
    });
  });

  it('should parse Firefox 14 error', () => {
    const FIREFOX_14 = {
      name: 'foo',
      message: 'x is null',
      stack:
        '@http://path/to/file.js:48\n' +
        'dumpException3@http://path/to/file.js:52\n' +
        'onclick@http://path/to/file.js:1\n' +
        '',
      fileName: 'http://path/to/file.js',
      lineNumber: 48,
    };

    const stackFrames = computeStackTrace(FIREFOX_14);

    expect(stackFrames).toEqual({
      message: 'x is null',
      name: 'foo',
      stack: [
        { url: 'http://path/to/file.js', func: '?', line: 48, column: null },
        { url: 'http://path/to/file.js', func: 'dumpException3', line: 52, column: null },
        { url: 'http://path/to/file.js', func: 'onclick', line: 1, column: null },
      ],
    });
  });

  it('should parse Firefox 31 error', () => {
    const FIREFOX_31 = {
      message: 'Default error',
      name: 'Error',
      stack:
        'foo@http://path/to/file.js:41:13\n' +
        'bar@http://path/to/file.js:1:1\n' +
        '.plugin/e.fn[c]/<@http://path/to/file.js:1:1\n' +
        '',
      fileName: 'http://path/to/file.js',
      lineNumber: 41,
      columnNumber: 12,
    };

    const stackFrames = computeStackTrace(FIREFOX_31);

    expect(stackFrames).toEqual({
      message: 'Default error',
      name: 'Error',
      stack: [
        { url: 'http://path/to/file.js', func: 'foo', line: 41, column: 13 },
        { url: 'http://path/to/file.js', func: 'bar', line: 1, column: 1 },
        { url: 'http://path/to/file.js', func: '.plugin/e.fn[c]/<', line: 1, column: 1 },
      ],
    });
  });

  it('should parse Firefox 44 ns exceptions', () => {
    // Internal errors sometimes thrown by Firefox
    // More here: https://developer.mozilla.org/en-US/docs/Mozilla/Errors
    //
    // Note that such errors are instanceof "Exception", not "Error"
    const FIREFOX_44_NS_EXCEPTION = {
      message: '',
      name: 'NS_ERROR_FAILURE',
      stack:
        '[2]</Bar.prototype._baz/</<@http://path/to/file.js:703:28\n' +
        'App.prototype.foo@file:///path/to/file.js:15:2\n' +
        'bar@file:///path/to/file.js:20:3\n' +
        '@file:///path/to/index.html:23:1\n' + // inside <script> tag
        '',
      fileName: 'http://path/to/file.js',
      columnNumber: 0,
      lineNumber: 703,
      result: 2147500037,
    };

    const stackFrames = computeStackTrace(FIREFOX_44_NS_EXCEPTION);

    expect(stackFrames).toEqual({
      message: 'No error message',
      name: 'NS_ERROR_FAILURE',
      stack: [
        { url: 'http://path/to/file.js', func: '[2]</Bar.prototype._baz/</<', line: 703, column: 28 },
        { url: 'file:///path/to/file.js', func: 'App.prototype.foo', line: 15, column: 2 },
        { url: 'file:///path/to/file.js', func: 'bar', line: 20, column: 3 },
        { url: 'file:///path/to/index.html', func: '?', line: 23, column: 1 },
      ],
    });
  });

  it('should parse Firefox errors with resource: URLs', () => {
    const FIREFOX_50_RESOURCE_URL = {
      stack:
        'render@resource://path/data/content/bundle.js:5529:16\n' +
        'dispatchEvent@resource://path/data/content/vendor.bundle.js:18:23028\n' +
        'wrapped@resource://path/data/content/bundle.js:7270:25',
      fileName: 'resource://path/data/content/bundle.js',
      lineNumber: 5529,
      columnNumber: 16,
      message: 'this.props.raw[this.state.dataSource].rows is undefined',
      name: 'TypeError',
    };

    const stackFrames = computeStackTrace(FIREFOX_50_RESOURCE_URL);

    expect(stackFrames).toEqual({
      message: 'this.props.raw[this.state.dataSource].rows is undefined',
      name: 'TypeError',
      stack: [
        { url: 'resource://path/data/content/bundle.js', func: 'render', line: 5529, column: 16 },
        { url: 'resource://path/data/content/vendor.bundle.js', func: 'dispatchEvent', line: 18, column: 23028 },
        { url: 'resource://path/data/content/bundle.js', func: 'wrapped', line: 7270, column: 25 },
      ],
    });
  });

  it('should parse Firefox errors with eval URLs', () => {
    const FIREFOX_43_EVAL = {
      name: 'foo',
      columnNumber: 30,
      fileName: 'http://localhost:8080/file.js line 25 > eval line 2 > eval',
      lineNumber: 1,
      message: 'message string',
      stack:
        'baz@http://localhost:8080/file.js line 26 > eval line 2 > eval:1:30\n' +
        'foo@http://localhost:8080/file.js line 26 > eval:2:96\n' +
        '@http://localhost:8080/file.js line 26 > eval:4:18\n' +
        'speak@http://localhost:8080/file.js:26:17\n' +
        '@http://localhost:8080/file.js:33:9',
    };

    const stackFrames = computeStackTrace(FIREFOX_43_EVAL);

    expect(stackFrames).toEqual({
      message: 'message string',
      name: 'foo',
      stack: [
        { url: 'http://localhost:8080/file.js', func: 'baz', line: 26, column: null },
        { url: 'http://localhost:8080/file.js', func: 'foo', line: 26, column: null },
        { url: 'http://localhost:8080/file.js', func: 'eval', line: 26, column: null },
        { url: 'http://localhost:8080/file.js', func: 'speak', line: 26, column: 17 },
        { url: 'http://localhost:8080/file.js', func: '?', line: 33, column: 9 },
      ],
    });
  });

  it('should parse exceptions with native code frames in Firefox 66', () => {
    const FIREFOX66_NATIVE_CODE_EXCEPTION = {
      message: 'test',
      name: 'Error',
      stack: `fooIterator@http://localhost:5000/test:20:17
          foo@http://localhost:5000/test:19:19
          @http://localhost:5000/test:24:7`,
    };

    const stacktrace = computeStackTrace(FIREFOX66_NATIVE_CODE_EXCEPTION);

    expect(stacktrace).toEqual({
      message: 'test',
      name: 'Error',
      stack: [
        { url: 'http://localhost:5000/test', func: 'fooIterator', line: 20, column: 17 },
        { url: 'http://localhost:5000/test', func: 'foo', line: 19, column: 19 },
        { url: 'http://localhost:5000/test', func: '?', line: 24, column: 7 },
      ],
    });
  });

  it('should parse exceptions with eval frames in Firefox 66', () => {
    const FIREFOX66_EVAL_EXCEPTION = {
      message: 'aha',
      name: 'Error',
      stack: `aha@http://localhost:5000/:19:13
          callAnotherThing@http://localhost:5000/:20:15
          callback@http://localhost:5000/:25:7
          test/<@http://localhost:5000/:34:7
          test@http://localhost:5000/:33:23
          @http://localhost:5000/ line 39 > eval:1:1
          aha@http://localhost:5000/:39:5
          testMethod@http://localhost:5000/:44:7
          @http://localhost:5000/:50:19`,
    };

    const stacktrace = computeStackTrace(FIREFOX66_EVAL_EXCEPTION);

    expect(stacktrace).toEqual({
      message: 'aha',
      name: 'Error',
      stack: [
        { url: 'http://localhost:5000/', func: 'aha', line: 19, column: 13 },
        { url: 'http://localhost:5000/', func: 'callAnotherThing', line: 20, column: 15 },
        { url: 'http://localhost:5000/', func: 'callback', line: 25, column: 7 },
        { url: 'http://localhost:5000/', func: 'test/<', line: 34, column: 7 },
        { url: 'http://localhost:5000/', func: 'test', line: 33, column: 23 },
        { url: 'http://localhost:5000/', func: 'eval', line: 39, column: null },
        { url: 'http://localhost:5000/', func: 'aha', line: 39, column: 5 },
        { url: 'http://localhost:5000/', func: 'testMethod', line: 44, column: 7 },
        { url: 'http://localhost:5000/', func: '?', line: 50, column: 19 },
      ],
    });
  });
});
