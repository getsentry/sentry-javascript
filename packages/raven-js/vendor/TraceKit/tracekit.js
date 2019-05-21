var utils = require('../../src/utils');

/*
 TraceKit - Cross brower stack traces

 This was originally forked from github.com/occ/TraceKit, but has since been
 largely re-written and is now maintained as part of raven-js.  Tests for
 this are in test/vendor.

 MIT license
*/

var TraceKit = {
  collectWindowErrors: true,
  debug: false
};

// This is to be defensive in environments where window does not exist (see https://github.com/getsentry/raven-js/pull/785)
var _window =
  typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
    ? global
    : typeof self !== 'undefined'
    ? self
    : {};

// global reference to slice
var _slice = [].slice;
var UNKNOWN_FUNCTION = '?';

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#Error_types
var ERROR_TYPES_RE = /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?(.*)$/;

function getLocationHref() {
  if (typeof document === 'undefined' || document.location == null) return '';
  return document.location.href;
}

function getLocationOrigin() {
  if (typeof document === 'undefined' || document.location == null) return '';

  // Oh dear IE10...
  if (!document.location.origin) {
    return (
      document.location.protocol +
      '//' +
      document.location.hostname +
      (document.location.port ? ':' + document.location.port : '')
    );
  }

  return document.location.origin;
}

/**
 * TraceKit.report: cross-browser processing of unhandled exceptions
 *
 * Syntax:
 *   TraceKit.report.subscribe(function(stackInfo) { ... })
 *   TraceKit.report.unsubscribe(function(stackInfo) { ... })
 *   TraceKit.report(exception)
 *   try { ...code... } catch(ex) { TraceKit.report(ex); }
 *
 * Supports:
 *   - Firefox: full stack trace with line numbers, plus column number
 *              on top frame; column number is not guaranteed
 *   - Opera:   full stack trace with line and column numbers
 *   - Chrome:  full stack trace with line and column numbers
 *   - Safari:  line and column number for the top frame only; some frames
 *              may be missing, and column number is not guaranteed
 *   - IE:      line and column number for the top frame only; some frames
 *              may be missing, and column number is not guaranteed
 *
 * In theory, TraceKit should work on all of the following versions:
 *   - IE5.5+ (only 8.0 tested)
 *   - Firefox 0.9+ (only 3.5+ tested)
 *   - Opera 7+ (only 10.50 tested; versions 9 and earlier may require
 *     Exceptions Have Stacktrace to be enabled in opera:config)
 *   - Safari 3+ (only 4+ tested)
 *   - Chrome 1+ (only 5+ tested)
 *   - Konqueror 3.5+ (untested)
 *
 * Requires TraceKit.computeStackTrace.
 *
 * Tries to catch all unhandled exceptions and report them to the
 * subscribed handlers. Please note that TraceKit.report will rethrow the
 * exception. This is REQUIRED in order to get a useful stack trace in IE.
 * If the exception does not reach the top of the browser, you will only
 * get a stack trace from the point where TraceKit.report was called.
 *
 * Handlers receive a stackInfo object as described in the
 * TraceKit.computeStackTrace docs.
 */
TraceKit.report = (function reportModuleWrapper() {
  var handlers = [],
    lastArgs = null,
    lastException = null,
    lastExceptionStack = null;

  /**
   * Add a crash handler.
   * @param {Function} handler
   */
  function subscribe(handler) {
    installGlobalHandler();
    handlers.push(handler);
  }

  /**
   * Remove a crash handler.
   * @param {Function} handler
   */
  function unsubscribe(handler) {
    for (var i = handlers.length - 1; i >= 0; --i) {
      if (handlers[i] === handler) {
        handlers.splice(i, 1);
      }
    }
  }

  /**
   * Remove all crash handlers.
   */
  function unsubscribeAll() {
    uninstallGlobalHandler();
    handlers = [];
  }

  /**
   * Dispatch stack information to all handlers.
   * @param {Object.<string, *>} stack
   */
  function notifyHandlers(stack, isWindowError) {
    var exception = null;
    if (isWindowError && !TraceKit.collectWindowErrors) {
      return;
    }
    for (var i in handlers) {
      if (handlers.hasOwnProperty(i)) {
        try {
          handlers[i].apply(null, [stack].concat(_slice.call(arguments, 2)));
        } catch (inner) {
          exception = inner;
        }
      }
    }

    if (exception) {
      throw exception;
    }
  }

  var _oldOnerrorHandler, _onErrorHandlerInstalled;

  /**
   * Ensures all global unhandled exceptions are recorded.
   * Supported by Gecko and IE.
   * @param {string} msg Error message.
   * @param {string} url URL of script that generated the exception.
   * @param {(number|string)} lineNo The line number at which the error
   * occurred.
   * @param {?(number|string)} colNo The column number at which the error
   * occurred.
   * @param {?Error} ex The actual Error object.
   */
  function traceKitWindowOnError(msg, url, lineNo, colNo, ex) {
    var stack = null;
    // If 'ex' is ErrorEvent, get real Error from inside
    var exception = utils.isErrorEvent(ex) ? ex.error : ex;
    // If 'msg' is ErrorEvent, get real message from inside
    var message = utils.isErrorEvent(msg) ? msg.message : msg;

    if (lastExceptionStack) {
      TraceKit.computeStackTrace.augmentStackTraceWithInitialElement(
        lastExceptionStack,
        url,
        lineNo,
        message
      );
      processLastException();
    } else if (exception && utils.isError(exception)) {
      // non-string `exception` arg; attempt to extract stack trace

      // New chrome and blink send along a real error object
      // Let's just report that like a normal error.
      // See: https://mikewest.org/2013/08/debugging-runtime-errors-with-window-onerror
      stack = TraceKit.computeStackTrace(exception);
      notifyHandlers(stack, true);
    } else {
      var location = {
        url: url,
        line: lineNo,
        column: colNo
      };

      var name = undefined;
      var groups;

      if ({}.toString.call(message) === '[object String]') {
        var groups = message.match(ERROR_TYPES_RE);
        if (groups) {
          name = groups[1];
          message = groups[2];
        }
      }

      location.func = UNKNOWN_FUNCTION;

      stack = {
        name: name,
        message: message,
        url: getLocationHref(),
        stack: [location]
      };
      notifyHandlers(stack, true);
    }

    if (_oldOnerrorHandler) {
      return _oldOnerrorHandler.apply(this, arguments);
    }

    return false;
  }

  function installGlobalHandler() {
    if (_onErrorHandlerInstalled) {
      return;
    }
    _oldOnerrorHandler = _window.onerror;
    _window.onerror = traceKitWindowOnError;
    _onErrorHandlerInstalled = true;
  }

  function uninstallGlobalHandler() {
    if (!_onErrorHandlerInstalled) {
      return;
    }
    _window.onerror = _oldOnerrorHandler;
    _onErrorHandlerInstalled = false;
    _oldOnerrorHandler = undefined;
  }

  function processLastException() {
    var _lastExceptionStack = lastExceptionStack,
      _lastArgs = lastArgs;
    lastArgs = null;
    lastExceptionStack = null;
    lastException = null;
    notifyHandlers.apply(null, [_lastExceptionStack, false].concat(_lastArgs));
  }

  /**
   * Reports an unhandled Error to TraceKit.
   * @param {Error} ex
   * @param {?boolean} rethrow If false, do not re-throw the exception.
   * Only used for window.onerror to not cause an infinite loop of
   * rethrowing.
   */
  function report(ex, rethrow) {
    var args = _slice.call(arguments, 1);
    if (lastExceptionStack) {
      if (lastException === ex) {
        return; // already caught by an inner catch block, ignore
      } else {
        processLastException();
      }
    }

    var stack = TraceKit.computeStackTrace(ex);
    lastExceptionStack = stack;
    lastException = ex;
    lastArgs = args;

    // If the stack trace is incomplete, wait for 2 seconds for
    // slow slow IE to see if onerror occurs or not before reporting
    // this exception; otherwise, we will end up with an incomplete
    // stack trace
    setTimeout(
      function() {
        if (lastException === ex) {
          processLastException();
        }
      },
      stack.incomplete ? 2000 : 0
    );

    if (rethrow !== false) {
      throw ex; // re-throw to propagate to the top level (and cause window.onerror)
    }
  }

  report.subscribe = subscribe;
  report.unsubscribe = unsubscribe;
  report.uninstall = unsubscribeAll;
  return report;
})();

/**
 * TraceKit.computeStackTrace: cross-browser stack traces in JavaScript
 *
 * Syntax:
 *   s = TraceKit.computeStackTrace(exception) // consider using TraceKit.report instead (see below)
 * Returns:
 *   s.name              - exception name
 *   s.message           - exception message
 *   s.stack[i].url      - JavaScript or HTML file URL
 *   s.stack[i].func     - function name, or empty for anonymous functions (if guessing did not work)
 *   s.stack[i].args     - arguments passed to the function, if known
 *   s.stack[i].line     - line number, if known
 *   s.stack[i].column   - column number, if known
 *
 * Supports:
 *   - Firefox:  full stack trace with line numbers and unreliable column
 *               number on top frame
 *   - Opera 10: full stack trace with line and column numbers
 *   - Opera 9-: full stack trace with line numbers
 *   - Chrome:   full stack trace with line and column numbers
 *   - Safari:   line and column number for the topmost stacktrace element
 *               only
 *   - IE:       no line numbers whatsoever
 *
 * Tries to guess names of anonymous functions by looking for assignments
 * in the source code. In IE and Safari, we have to guess source file names
 * by searching for function bodies inside all page scripts. This will not
 * work for scripts that are loaded cross-domain.
 * Here be dragons: some function names may be guessed incorrectly, and
 * duplicate functions may be mismatched.
 *
 * TraceKit.computeStackTrace should only be used for tracing purposes.
 * Logging of unhandled exceptions should be done with TraceKit.report,
 * which builds on top of TraceKit.computeStackTrace and provides better
 * IE support by utilizing the window.onerror event to retrieve information
 * about the top of the stack.
 *
 * Note: In IE and Safari, no stack trace is recorded on the Error object,
 * so computeStackTrace instead walks its *own* chain of callers.
 * This means that:
 *  * in Safari, some methods may be missing from the stack trace;
 *  * in IE, the topmost function in the stack trace will always be the
 *    caller of computeStackTrace.
 *
 * This is okay for tracing (because you are likely to be calling
 * computeStackTrace from the function you want to be the topmost element
 * of the stack trace anyway), but not okay for logging unhandled
 * exceptions (because your catch block will likely be far away from the
 * inner function that actually caused the exception).
 *
 */
TraceKit.computeStackTrace = (function computeStackTraceWrapper() {
  // Contents of Exception in various browsers.
  //
  // SAFARI:
  // ex.message = Can't find variable: qq
  // ex.line = 59
  // ex.sourceId = 580238192
  // ex.sourceURL = http://...
  // ex.expressionBeginOffset = 96
  // ex.expressionCaretOffset = 98
  // ex.expressionEndOffset = 98
  // ex.name = ReferenceError
  //
  // FIREFOX:
  // ex.message = qq is not defined
  // ex.fileName = http://...
  // ex.lineNumber = 59
  // ex.columnNumber = 69
  // ex.stack = ...stack trace... (see the example below)
  // ex.name = ReferenceError
  //
  // CHROME:
  // ex.message = qq is not defined
  // ex.name = ReferenceError
  // ex.type = not_defined
  // ex.arguments = ['aa']
  // ex.stack = ...stack trace...
  //
  // INTERNET EXPLORER:
  // ex.message = ...
  // ex.name = ReferenceError
  //
  // OPERA:
  // ex.message = ...message... (see the example below)
  // ex.name = ReferenceError
  // ex.opera#sourceloc = 11  (pretty much useless, duplicates the info in ex.message)
  // ex.stacktrace = n/a; see 'opera:config#UserPrefs|Exceptions Have Stacktrace'

  /**
   * Computes stack trace information from the stack property.
   * Chrome and Gecko use this property.
   * @param {Error} ex
   * @return {?Object.<string, *>} Stack trace information.
   */
  function computeStackTraceFromStackProp(ex) {
    if (typeof ex.stack === 'undefined' || !ex.stack) return;

    var chrome = /^\s*at (?:(.*?) ?\()?((?:file|https?|blob|chrome-extension|native|eval|webpack|<anonymous>|[a-z]:|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i;
    var winjs = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx(?:-web)|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i;
    // NOTE: blob urls are now supposed to always have an origin, therefore it's format
    // which is `blob:http://url/path/with-some-uuid`, is matched by `blob.*?:\/` as well
    var gecko = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)((?:file|https?|blob|chrome|webpack|resource|moz-extension).*?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js))(?::(\d+))?(?::(\d+))?\s*$/i;
    // Used to additionally parse URL/line/column from eval frames
    var geckoEval = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i;
    var chromeEval = /\((\S*)(?::(\d+))(?::(\d+))\)/;
    var lines = ex.stack.split('\n');
    var stack = [];
    var submatch;
    var parts;
    var element;
    var reference = /^(.*) is undefined$/.exec(ex.message);

    for (var i = 0, j = lines.length; i < j; ++i) {
      if ((parts = chrome.exec(lines[i]))) {
        var isNative = parts[2] && parts[2].indexOf('native') === 0; // start of line
        var isEval = parts[2] && parts[2].indexOf('eval') === 0; // start of line
        if (isEval && (submatch = chromeEval.exec(parts[2]))) {
          // throw out eval line/column and use top-most line/column number
          parts[2] = submatch[1]; // url
          parts[3] = submatch[2]; // line
          parts[4] = submatch[3]; // column
        }
        element = {
          url: !isNative ? parts[2] : null,
          func: parts[1] || UNKNOWN_FUNCTION,
          args: isNative ? [parts[2]] : [],
          line: parts[3] ? +parts[3] : null,
          column: parts[4] ? +parts[4] : null
        };
      } else if ((parts = winjs.exec(lines[i]))) {
        element = {
          url: parts[2],
          func: parts[1] || UNKNOWN_FUNCTION,
          args: [],
          line: +parts[3],
          column: parts[4] ? +parts[4] : null
        };
      } else if ((parts = gecko.exec(lines[i]))) {
        var isEval = parts[3] && parts[3].indexOf(' > eval') > -1;
        if (isEval && (submatch = geckoEval.exec(parts[3]))) {
          // throw out eval line/column and use top-most line number
          parts[3] = submatch[1];
          parts[4] = submatch[2];
          parts[5] = null; // no column when eval
        } else if (i === 0 && !parts[5] && typeof ex.columnNumber !== 'undefined') {
          // FireFox uses this awesome columnNumber property for its top frame
          // Also note, Firefox's column number is 0-based and everything else expects 1-based,
          // so adding 1
          // NOTE: this hack doesn't work if top-most frame is eval
          stack[0].column = ex.columnNumber + 1;
        }
        element = {
          url: parts[3],
          func: parts[1] || UNKNOWN_FUNCTION,
          args: parts[2] ? parts[2].split(',') : [],
          line: parts[4] ? +parts[4] : null,
          column: parts[5] ? +parts[5] : null
        };
      } else {
        continue;
      }

      if (!element.func && element.line) {
        element.func = UNKNOWN_FUNCTION;
      }

      if (element.url && element.url.substr(0, 5) === 'blob:') {
        // Special case for handling JavaScript loaded into a blob.
        // We use a synchronous AJAX request here as a blob is already in
        // memory - it's not making a network request.  This will generate a warning
        // in the browser console, but there has already been an error so that's not
        // that much of an issue.
        var xhr = new XMLHttpRequest();
        xhr.open('GET', element.url, false);
        xhr.send(null);

        // If we failed to download the source, skip this patch
        if (xhr.status === 200) {
          var source = xhr.responseText || '';

          // We trim the source down to the last 300 characters as sourceMappingURL is always at the end of the file.
          // Why 300? To be in line with: https://github.com/getsentry/sentry/blob/4af29e8f2350e20c28a6933354e4f42437b4ba42/src/sentry/lang/javascript/processor.py#L164-L175
          source = source.slice(-300);

          // Now we dig out the source map URL
          var sourceMaps = source.match(/\/\/# sourceMappingURL=(.*)$/);

          // If we don't find a source map comment or we find more than one, continue on to the next element.
          if (sourceMaps) {
            var sourceMapAddress = sourceMaps[1];

            // Now we check to see if it's a relative URL.
            // If it is, convert it to an absolute one.
            if (sourceMapAddress.charAt(0) === '~') {
              sourceMapAddress = getLocationOrigin() + sourceMapAddress.slice(1);
            }

            // Now we strip the '.map' off of the end of the URL and update the
            // element so that Sentry can match the map to the blob.
            element.url = sourceMapAddress.slice(0, -4);
          }
        }
      }

      stack.push(element);
    }

    if (!stack.length) {
      return null;
    }

    return {
      name: ex.name,
      message: ex.message,
      url: getLocationHref(),
      stack: stack
    };
  }

  /**
   * Adds information about the first frame to incomplete stack traces.
   * Safari and IE require this to get complete data on the first frame.
   * @param {Object.<string, *>} stackInfo Stack trace information from
   * one of the compute* methods.
   * @param {string} url The URL of the script that caused an error.
   * @param {(number|string)} lineNo The line number of the script that
   * caused an error.
   * @param {string=} message The error generated by the browser, which
   * hopefully contains the name of the object that caused the error.
   * @return {boolean} Whether or not the stack information was
   * augmented.
   */
  function augmentStackTraceWithInitialElement(stackInfo, url, lineNo, message) {
    var initial = {
      url: url,
      line: lineNo
    };

    if (initial.url && initial.line) {
      stackInfo.incomplete = false;

      if (!initial.func) {
        initial.func = UNKNOWN_FUNCTION;
      }

      if (stackInfo.stack.length > 0) {
        if (stackInfo.stack[0].url === initial.url) {
          if (stackInfo.stack[0].line === initial.line) {
            return false; // already in stack trace
          } else if (
            !stackInfo.stack[0].line &&
            stackInfo.stack[0].func === initial.func
          ) {
            stackInfo.stack[0].line = initial.line;
            return false;
          }
        }
      }

      stackInfo.stack.unshift(initial);
      stackInfo.partial = true;
      return true;
    } else {
      stackInfo.incomplete = true;
    }

    return false;
  }

  /**
   * Computes stack trace information by walking the arguments.caller
   * chain at the time the exception occurred. This will cause earlier
   * frames to be missed but is the only way to get any stack trace in
   * Safari and IE. The top frame is restored by
   * {@link augmentStackTraceWithInitialElement}.
   * @param {Error} ex
   * @return {?Object.<string, *>} Stack trace information.
   */
  function computeStackTraceByWalkingCallerChain(ex, depth) {
    var functionName = /function\s+([_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*)?\s*\(/i,
      stack = [],
      funcs = {},
      recursion = false,
      parts,
      item,
      source;

    for (
      var curr = computeStackTraceByWalkingCallerChain.caller;
      curr && !recursion;
      curr = curr.caller
    ) {
      if (curr === computeStackTrace || curr === TraceKit.report) {
        // console.log('skipping internal function');
        continue;
      }

      item = {
        url: null,
        func: UNKNOWN_FUNCTION,
        line: null,
        column: null
      };

      if (curr.name) {
        item.func = curr.name;
      } else if ((parts = functionName.exec(curr.toString()))) {
        item.func = parts[1];
      }

      if (typeof item.func === 'undefined') {
        try {
          item.func = parts.input.substring(0, parts.input.indexOf('{'));
        } catch (e) {}
      }

      if (funcs['' + curr]) {
        recursion = true;
      } else {
        funcs['' + curr] = true;
      }

      stack.push(item);
    }

    if (depth) {
      // console.log('depth is ' + depth);
      // console.log('stack is ' + stack.length);
      stack.splice(0, depth);
    }

    var result = {
      name: ex.name,
      message: ex.message,
      url: getLocationHref(),
      stack: stack
    };
    augmentStackTraceWithInitialElement(
      result,
      ex.sourceURL || ex.fileName,
      ex.line || ex.lineNumber,
      ex.message || ex.description
    );
    return result;
  }

  /**
   * Computes a stack trace for an exception.
   * @param {Error} ex
   * @param {(string|number)=} depth
   */
  function computeStackTrace(ex, depth) {
    var stack = null;
    depth = depth == null ? 0 : +depth;

    try {
      stack = computeStackTraceFromStackProp(ex);
      if (stack) {
        return stack;
      }
    } catch (e) {
      if (TraceKit.debug) {
        throw e;
      }
    }

    try {
      stack = computeStackTraceByWalkingCallerChain(ex, depth + 1);
      if (stack) {
        return stack;
      }
    } catch (e) {
      if (TraceKit.debug) {
        throw e;
      }
    }
    return {
      name: ex.name,
      message: ex.message,
      url: getLocationHref()
    };
  }

  computeStackTrace.augmentStackTraceWithInitialElement = augmentStackTraceWithInitialElement;
  computeStackTrace.computeStackTraceFromStackProp = computeStackTraceFromStackProp;

  return computeStackTrace;
})();

module.exports = TraceKit;
