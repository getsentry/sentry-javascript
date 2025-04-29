import { describe, expect, it } from 'vitest';
import { exceptionFromError } from '../../src/eventbuilder';
import { defaultStackParser as parser } from '../../src/stack-parsers';

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

    const ex = exceptionFromError(parser, FIREFOX_3);

    expect(ex).toEqual({
      value: 'this.undef is not a function',
      type: 'TypeError',
      stacktrace: {
        frames: [
          { filename: 'http://127.0.0.1:8000/js/file.js', function: '?', lineno: 24, in_app: true },
          { filename: 'http://127.0.0.1:8000/js/file.js', function: 'foo', lineno: 20, in_app: true },
          { filename: 'http://127.0.0.1:8000/js/file.js', function: 'bar', lineno: 16, in_app: true },
          { filename: 'http://127.0.0.1:8000/js/file.js', function: 'bar', lineno: 13, in_app: true },
          { filename: 'http://127.0.0.1:8000/js/stacktrace.js', function: 'printStackTrace', lineno: 18, in_app: true },
          { filename: 'http://127.0.0.1:8000/js/stacktrace.js', function: '?', lineno: 31, in_app: true },
          { filename: 'http://127.0.0.1:8000/js/stacktrace.js', function: '?', lineno: 44, in_app: true },
        ],
      },
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

    const ex = exceptionFromError(parser, FIREFOX_7);

    expect(ex).toEqual({
      value: 'bar',
      type: 'foo',
      stacktrace: {
        frames: [
          { filename: 'file:///G:/js/file.js', function: '?', lineno: 24, in_app: true },
          { filename: 'file:///G:/js/file.js', function: 'foo', lineno: 20, in_app: true },
          { filename: 'file:///G:/js/file.js', function: 'bar', lineno: 16, in_app: true },
          { filename: 'file:///G:/js/file.js', function: 'bar', lineno: 13, in_app: true },
          { filename: 'file:///G:/js/stacktrace.js', function: 'printStackTrace', lineno: 18, in_app: true },
          { filename: 'file:///G:/js/stacktrace.js', function: '?', lineno: 31, in_app: true },
          { filename: 'file:///G:/js/stacktrace.js', function: '?', lineno: 44, in_app: true },
        ],
      },
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

    const ex = exceptionFromError(parser, FIREFOX_14);

    expect(ex).toEqual({
      value: 'x is null',
      type: 'foo',
      stacktrace: {
        frames: [
          { filename: 'http://path/to/file.js', function: 'onclick', lineno: 1, in_app: true },
          { filename: 'http://path/to/file.js', function: 'dumpException3', lineno: 52, in_app: true },
          { filename: 'http://path/to/file.js', function: '?', lineno: 48, in_app: true },
        ],
      },
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

    const ex = exceptionFromError(parser, FIREFOX_31);

    expect(ex).toEqual({
      value: 'Default error',
      type: 'Error',
      stacktrace: {
        frames: [
          { filename: 'http://path/to/file.js', function: '.plugin/e.fn[c]/<', lineno: 1, colno: 1, in_app: true },
          { filename: 'http://path/to/file.js', function: 'bar', lineno: 1, colno: 1, in_app: true },
          { filename: 'http://path/to/file.js', function: 'foo', lineno: 41, colno: 13, in_app: true },
        ],
      },
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

    const ex = exceptionFromError(parser, FIREFOX_44_NS_EXCEPTION);

    expect(ex).toEqual({
      value: 'No error message',
      type: 'NS_ERROR_FAILURE',
      stacktrace: {
        frames: [
          { filename: 'file:///path/to/index.html', function: '?', lineno: 23, colno: 1, in_app: true },
          { filename: 'file:///path/to/file.js', function: 'bar', lineno: 20, colno: 3, in_app: true },
          { filename: 'file:///path/to/file.js', function: 'App.prototype.foo', lineno: 15, colno: 2, in_app: true },
          {
            filename: 'http://path/to/file.js',
            function: '[2]</Bar.prototype._baz/</<',
            lineno: 703,
            colno: 28,
            in_app: true,
          },
        ],
      },
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

    const ex = exceptionFromError(parser, FIREFOX_50_RESOURCE_URL);

    expect(ex).toEqual({
      value: 'this.props.raw[this.state.dataSource].rows is undefined',
      type: 'TypeError',
      stacktrace: {
        frames: [
          {
            filename: 'resource://path/data/content/bundle.js',
            function: 'wrapped',
            lineno: 7270,
            colno: 25,
            in_app: true,
          },
          {
            filename: 'resource://path/data/content/vendor.bundle.js',
            function: 'dispatchEvent',
            lineno: 18,
            colno: 23028,
            in_app: true,
          },
          {
            filename: 'resource://path/data/content/bundle.js',
            function: 'render',
            lineno: 5529,
            colno: 16,
            in_app: true,
          },
        ],
      },
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

    const ex = exceptionFromError(parser, FIREFOX_43_EVAL);

    expect(ex).toEqual({
      value: 'message string',
      type: 'foo',
      stacktrace: {
        frames: [
          { filename: 'http://localhost:8080/file.js', function: '?', lineno: 33, colno: 9, in_app: true },
          { filename: 'http://localhost:8080/file.js', function: 'speak', lineno: 26, colno: 17, in_app: true },
          { filename: 'http://localhost:8080/file.js', function: 'eval', lineno: 26, in_app: true },
          { filename: 'http://localhost:8080/file.js', function: 'foo', lineno: 26, in_app: true },
          { filename: 'http://localhost:8080/file.js', function: 'baz', lineno: 26, in_app: true },
        ],
      },
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

    const stacktrace = exceptionFromError(parser, FIREFOX66_NATIVE_CODE_EXCEPTION);

    expect(stacktrace).toEqual({
      value: 'test',
      type: 'Error',
      stacktrace: {
        frames: [
          { filename: 'http://localhost:5000/test', function: '?', lineno: 24, colno: 7, in_app: true },
          { filename: 'http://localhost:5000/test', function: 'foo', lineno: 19, colno: 19, in_app: true },
          { filename: 'http://localhost:5000/test', function: 'fooIterator', lineno: 20, colno: 17, in_app: true },
        ],
      },
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

    const stacktrace = exceptionFromError(parser, FIREFOX66_EVAL_EXCEPTION);

    expect(stacktrace).toEqual({
      value: 'aha',
      type: 'Error',
      stacktrace: {
        frames: [
          { filename: 'http://localhost:5000/', function: '?', lineno: 50, colno: 19, in_app: true },
          { filename: 'http://localhost:5000/', function: 'testMethod', lineno: 44, colno: 7, in_app: true },
          { filename: 'http://localhost:5000/', function: 'aha', lineno: 39, colno: 5, in_app: true },
          { filename: 'http://localhost:5000/', function: 'eval', lineno: 39, in_app: true },
          { filename: 'http://localhost:5000/', function: 'test', lineno: 33, colno: 23, in_app: true },
          { filename: 'http://localhost:5000/', function: 'test/<', lineno: 34, colno: 7, in_app: true },
          { filename: 'http://localhost:5000/', function: 'callback', lineno: 25, colno: 7, in_app: true },
          { filename: 'http://localhost:5000/', function: 'callAnotherThing', lineno: 20, colno: 15, in_app: true },
          { filename: 'http://localhost:5000/', function: 'aha', lineno: 19, colno: 13, in_app: true },
        ],
      },
    });
  });

  it('should correctly parse parentheses', () => {
    const PARENTHESIS_FRAME_EXCEPTION = {
      message: 'aha',
      name: 'Error',
      stack:
        'onClick@http://localhost:3002/_next/static/chunks/app/(group)/[route]/script.js:1:644\n' +
        '@http://localhost:3002/_next/static/chunks/app/(group)/[route]/script.js:1:126',
    };

    const stacktrace = exceptionFromError(parser, PARENTHESIS_FRAME_EXCEPTION);

    expect(stacktrace).toEqual({
      value: 'aha',
      type: 'Error',
      stacktrace: {
        frames: [
          {
            colno: 126,
            filename: 'http://localhost:3002/_next/static/chunks/app/(group)/[route]/script.js',
            function: '?',
            in_app: true,
            lineno: 1,
          },
          {
            colno: 644,
            filename: 'http://localhost:3002/_next/static/chunks/app/(group)/[route]/script.js',
            function: 'onClick',
            in_app: true,
            lineno: 1,
          },
        ],
      },
    });
  });

  it('should parse Firefox errors with `file` inside an identifier', () => {
    const FIREFOX_FILE_IN_IDENTIFIER = {
      stack:
        'us@https://www.random_website.com/vendor.d1cae9cfc9917df88de7.js:1:296021\n' +
        'detectChanges@https://www.random_website.com/vendor.d1cae9cfc9917df88de7.js:1:333807\n' +
        'handleProfileResult@https://www.random_website.com/main.4a4119c3cdfd10266d84.js:146:1018410\n',
      fileName: 'https://www.random_website.com/main.4a4119c3cdfd10266d84.js',
      lineNumber: 5529,
      columnNumber: 16,
      message: 'this.props.raw[this.state.dataSource].rows is undefined',
      name: 'TypeError',
    };

    const stacktrace = exceptionFromError(parser, FIREFOX_FILE_IN_IDENTIFIER);

    expect(stacktrace).toEqual({
      stacktrace: {
        frames: [
          {
            colno: 1018410,
            filename: 'https://www.random_website.com/main.4a4119c3cdfd10266d84.js',
            function: 'handleProfileResult',
            in_app: true,
            lineno: 146,
          },
          {
            colno: 333807,
            filename: 'https://www.random_website.com/vendor.d1cae9cfc9917df88de7.js',
            function: 'detectChanges',
            in_app: true,
            lineno: 1,
          },
          {
            colno: 296021,
            filename: 'https://www.random_website.com/vendor.d1cae9cfc9917df88de7.js',
            function: 'us',
            in_app: true,
            lineno: 1,
          },
        ],
      },
      type: 'TypeError',
      value: 'this.props.raw[this.state.dataSource].rows is undefined',
    });
  });
});
