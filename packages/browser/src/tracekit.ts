// tslint:disable

import { getGlobalObject, isError, isErrorEvent, normalize } from '@sentry/utils';

/**
 * @hidden
 */
export interface StackFrame {
  url: string;
  func: string;
  args: string[];
  line: number;
  column: number;
  context: string[];
}

/**
 * @hidden
 */
export interface StackTrace {
  /**
   * Known modes: callers, failed, multiline, onerror, stack, stacktrace
   */
  mode: string;
  mechanism: string;
  name: string;
  message: string;
  url: string;
  stack: StackFrame[];
  useragent: string;
  original?: string;
}

interface ComputeStackTrace {
  /**
   * Computes a stack trace for an exception.
   * @param {Error} ex
   * @param {(string|number)=} depth
   */
  (ex: Error, depth?: string | number): StackTrace;
}

/**
 * TraceKit - Cross brower stack traces
 *
 * This was originally forked from github.com/occ/TraceKit, but has since been
 * largely modified and is now maintained as part of Sentry JS SDK.
 *
 * NOTE: Last merge with upstream repository
 * Jul 11,2018 - #f03357c
 *
 * https://github.com/csnover/TraceKit
 * @license MIT
 * @namespace TraceKit
 */

var window = getGlobalObject<Window>();

interface TraceKit {
  _report: any;
  _collectWindowErrors: any;
  _computeStackTrace: any;
  _linesOfContext: any;
}

var TraceKit: TraceKit = {
  _report: false,
  _collectWindowErrors: false,
  _computeStackTrace: false,
  _linesOfContext: false,
};

// var TraceKit: TraceKitInterface = {};
// var TraceKit = {};

// global reference to slice
var UNKNOWN_FUNCTION = '?';

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#Error_types
var ERROR_TYPES_RE = /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?(.*)$/;

/**
 * A better form of hasOwnProperty<br/>
 * Example: `_has(MainHostObject, property) === true/false`
 *
 * @param {Object} object to check property
 * @param {string} key to check
 * @return {Boolean} true if the object has the key and it is not inherited
 */
function _has(object: any, key: any) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * A safe form of location.href<br/>
 *
 * @return {string} location.href
 */
function getLocationHref() {
  if (typeof document === 'undefined' || document.location == null) return '';
  return document.location.href;
}

/**
 * Cross-browser processing of unhandled exceptions
 *
 * Syntax:
 * ```js
 *   TraceKit.report.subscribe(function(stackInfo) { ... })
 *   TraceKit.report(exception)
 *   try { ...code... } catch(ex) { TraceKit.report(ex); }
 * ```
 *
 * Supports:
 *   - Firefox: full stack trace with line numbers, plus column number
 *     on top frame; column number is not guaranteed
 *   - Opera: full stack trace with line and column numbers
 *   - Chrome: full stack trace with line and column numbers
 *   - Safari: line and column number for the top frame only; some frames
 *     may be missing, and column number is not guaranteed
 *   - IE: line and column number for the top frame only; some frames
 *     may be missing, and column number is not guaranteed
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
 * Requires TraceKit._computeStackTrace.
 *
 * Tries to catch all unhandled exceptions and report them to the
 * subscribed handlers. Please note that TraceKit.report will rethrow the
 * exception. This is REQUIRED in order to get a useful stack trace in IE.
 * If the exception does not reach the top of the browser, you will only
 * get a stack trace from the point where TraceKit.report was called.
 *
 * Handlers receive a TraceKit.StackTrace object as described in the
 * TraceKit._computeStackTrace docs.
 *
 * @memberof TraceKit
 * @namespace
 */
TraceKit._report = (function reportModuleWrapper() {
  var handlers: any = [],
    lastException: any = null,
    lastExceptionStack: any = null;

  /**
   * Add a crash handler.
   * @param {Function} handler
   * @memberof TraceKit.report
   */
  function _subscribe(handler: any) {
    // NOTE: We call both handlers manually in browser/integrations/globalhandler.ts
    // So user can choose which one he wants to attach

    // installGlobalHandler();
    // installGlobalUnhandledRejectionHandler();
    handlers.push(handler);
  }

  /**
   * Dispatch stack information to all handlers.
   * @param {TraceKit.StackTrace} stack
   * @param {boolean} isWindowError Is this a top-level window error?
   * @param {Error=} error The error that's being handled (if available, null otherwise)
   * @memberof TraceKit.report
   * @throws An exception if an error occurs while calling an handler.
   */
  function _notifyHandlers(stack: any, isWindowError: any, error: any) {
    var exception = null;
    if (isWindowError && !TraceKit._collectWindowErrors) {
      return;
    }
    for (var i in handlers) {
      if (_has(handlers, i)) {
        try {
          handlers[i](stack, isWindowError, error);
        } catch (inner) {
          exception = inner;
        }
      }
    }

    if (exception) {
      throw exception;
    }
  }

  var _oldOnerrorHandler: any, _onErrorHandlerInstalled: any;

  /**
   * Ensures all global unhandled exceptions are recorded.
   * Supported by Gecko and IE.
   * @param {string} message Error message.
   * @param {string} url URL of script that generated the exception.
   * @param {(number|string)} lineNo The line number at which the error occurred.
   * @param {(number|string)=} columnNo The column number at which the error occurred.
   * @param {Error=} errorObj The actual Error object.
   * @memberof TraceKit.report
   */
  function _traceKitWindowOnError(message: any, url: any, lineNo: any, columnNo: any, errorObj: any) {
    var stack = null;
    // If 'errorObj' is ErrorEvent, get real Error from inside
    errorObj = isErrorEvent(errorObj) ? errorObj.error : errorObj;
    // If 'message' is ErrorEvent, get real message from inside
    message = isErrorEvent(message) ? message.message : message;

    if (lastExceptionStack) {
      TraceKit._computeStackTrace._augmentStackTraceWithInitialElement(lastExceptionStack, url, lineNo, message);
      processLastException();
    } else if (errorObj && isError(errorObj)) {
      stack = TraceKit._computeStackTrace(errorObj);
      stack.mechanism = 'onerror';
      _notifyHandlers(stack, true, errorObj);
    } else {
      var location: any = {
        url: url,
        line: lineNo,
        column: columnNo,
      };

      var name;
      var msg = message; // must be new var or will modify original `arguments`
      if ({}.toString.call(message) === '[object String]') {
        var groups = message.match(ERROR_TYPES_RE);
        if (groups) {
          name = groups[1];
          msg = groups[2];
        }
      }

      location.func = UNKNOWN_FUNCTION;
      location.context = null;
      stack = {
        name: name,
        message: msg,
        mode: 'onerror',
        mechanism: 'onerror',
        stack: [
          {
            ...location,
            // Firefox sometimes doesn't return url correctly and this is an old behavior
            // that I prefer to port here as well.
            // It can be altered only here, as previously it's using `location.url` for other things — Kamil
            url: location.url || getLocationHref(),
          },
        ],
      };

      _notifyHandlers(stack, true, null);
    }

    if (_oldOnerrorHandler) {
      // @ts-ignore
      return _oldOnerrorHandler.apply(this, arguments);
    }

    return false;
  }

  /**
   * Ensures all unhandled rejections are recorded.
   * @param {PromiseRejectionEvent} e event.
   * @memberof TraceKit.report
   * @see https://developer.mozilla.org/en-US/docs/Web/API/WindowEventHandlers/onunhandledrejection
   * @see https://developer.mozilla.org/en-US/docs/Web/API/PromiseRejectionEvent
   */
  function _traceKitWindowOnUnhandledRejection(e: any) {
    var err = (e && (e.detail ? e.detail.reason : e.reason)) || e;
    var stack = TraceKit._computeStackTrace(err);
    stack.mechanism = 'onunhandledrejection';
    if (!stack.message) {
      stack.message = JSON.stringify(normalize(err))
    }
    _notifyHandlers(stack, true, err);
  }

  /**
   * Install a global onerror handler
   * @memberof TraceKit.report
   */
  function _installGlobalHandler() {
    if (_onErrorHandlerInstalled === true) {
      return;
    }

    _oldOnerrorHandler = window.onerror;
    window.onerror = _traceKitWindowOnError;
    _onErrorHandlerInstalled = true;
  }

  /**
   * Install a global onunhandledrejection handler
   * @memberof TraceKit.report
   */
  function _installGlobalUnhandledRejectionHandler() {
    (window as any).onunhandledrejection = _traceKitWindowOnUnhandledRejection;
  }

  /**
   * Process the most recent exception
   * @memberof TraceKit.report
   */
  function processLastException() {
    var _lastExceptionStack = lastExceptionStack,
      _lastException = lastException;
    lastExceptionStack = null;
    lastException = null;
    _notifyHandlers(_lastExceptionStack, false, _lastException);
  }

  /**
   * Reports an unhandled Error to TraceKit.
   * @param {Error} ex
   * @memberof TraceKit.report
   * @throws An exception if an incomplete stack trace is detected (old IE browsers).
   */
  function _report(ex: any) {
    if (lastExceptionStack) {
      if (lastException === ex) {
        return; // already caught by an inner catch block, ignore
      } else {
        processLastException();
      }
    }

    var stack = TraceKit._computeStackTrace(ex);
    lastExceptionStack = stack;
    lastException = ex;

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
      stack.incomplete ? 2000 : 0,
    );

    throw ex; // re-throw to propagate to the top level (and cause window.onerror)
  }

  (_report as any)._subscribe = _subscribe;
  (_report as any)._installGlobalHandler = _installGlobalHandler;
  (_report as any)._installGlobalUnhandledRejectionHandler = _installGlobalUnhandledRejectionHandler;

  return _report;
})();

/**
 * An object representing a single stack frame.
 * @typedef {Object} StackFrame
 * @property {string} url The JavaScript or HTML file URL.
 * @property {string} func The function name, or empty for anonymous functions (if guessing did not work).
 * @property {string[]?} args The arguments passed to the function, if known.
 * @property {number=} line The line number, if known.
 * @property {number=} column The column number, if known.
 * @property {string[]} context An array of source code lines; the middle element corresponds to the correct line#.
 * @memberof TraceKit
 */

/**
 * An object representing a JavaScript stack trace.
 * @typedef {Object} StackTrace
 * @property {string} name The name of the thrown exception.
 * @property {string} message The exception error message.
 * @property {TraceKit.StackFrame[]} stack An array of stack frames.
 * @property {string} mode 'stack', 'stacktrace', 'multiline', 'callers', 'onerror', or 'failed' -- method used to collect the stack trace.
 * @memberof TraceKit
 */

/**
 * TraceKit._computeStackTrace: cross-browser stack traces in JavaScript
 *
 * Syntax:
 *   ```js
 *   s = TraceKit._computeStackTrace(exception) // consider using TraceKit.report instead (see below)
 *   ```
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
 * TraceKit._computeStackTrace should only be used for tracing purposes.
 * Logging of unhandled exceptions should be done with TraceKit.report,
 * which builds on top of TraceKit._computeStackTrace and provides better
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
 * @memberof TraceKit
 * @namespace
 */

TraceKit._computeStackTrace = (function _computeStackTraceWrapper() {
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
   * @return {?TraceKit.StackTrace} Stack trace information.
   * @memberof TraceKit._computeStackTrace
   */
  function _computeStackTraceFromStackProp(ex: any) {
    if (!ex || !ex.stack) {
      return null;
    }

    // Chromium based browsers: Chrome, Brave, new Opera, new Edge
    var chrome = /^\s*at (?:(.*?) ?\()?((?:file|https?|blob|chrome-extension|native|eval|webpack|<anonymous>|[a-z]:|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i,
      // gecko regex: `(?:bundle|\d+\.js)`: `bundle` is for react native, `\d+\.js` also but specifically for ram bundles because it
      // generates filenames without a prefix like `file://` the filenames in the stacktrace are just 42.js
      // We need this specific case for now because we want no other regex to match.
      gecko = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:file|https?|blob|chrome|webpack|resource|moz-extension).*?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js))(?::(\d+))?(?::(\d+))?\s*$/i,
      winjs = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i,
      // Used to additionally parse URL/line/column from eval frames
      isEval,
      geckoEval = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i,
      chromeEval = /\((\S*)(?::(\d+))(?::(\d+))\)/,
      lines = ex.stack.split('\n'),
      stack = [],
      submatch,
      parts,
      element,
      reference = /^(.*) is undefined$/.exec(ex.message);

    for (var i = 0, j = lines.length; i < j; ++i) {
      if ((parts = chrome.exec(lines[i]))) {
        var isNative = parts[2] && parts[2].indexOf('native') === 0; // start of line
        isEval = parts[2] && parts[2].indexOf('eval') === 0; // start of line
        if (isEval && (submatch = chromeEval.exec(parts[2]))) {
          // throw out eval line/column and use top-most line/column number
          parts[2] = submatch[1]; // url
          parts[3] = submatch[2]; // line
          parts[4] = submatch[3]; // column
        }
        element = {
          url: parts[2],
          func: parts[1] || UNKNOWN_FUNCTION,
          args: isNative ? [parts[2]] : [],
          line: parts[3] ? +parts[3] : null,
          column: parts[4] ? +parts[4] : null,
        };
      } else if ((parts = winjs.exec(lines[i]))) {
        element = {
          url: parts[2],
          func: parts[1] || UNKNOWN_FUNCTION,
          args: [],
          line: +parts[3],
          column: parts[4] ? +parts[4] : null,
        };
      } else if ((parts = gecko.exec(lines[i]))) {
        isEval = parts[3] && parts[3].indexOf(' > eval') > -1;
        if (isEval && (submatch = geckoEval.exec(parts[3]))) {
          // throw out eval line/column and use top-most line number
          parts[1] = parts[1] || `eval`;
          parts[3] = submatch[1];
          parts[4] = submatch[2];
          parts[5] = ''; // no column when eval
        } else if (i === 0 && !parts[5] && ex.columnNumber !== void 0) {
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
          column: parts[5] ? +parts[5] : null,
        };
      } else {
        continue;
      }

      if (!element.func && element.line) {
        element.func = UNKNOWN_FUNCTION;
      }

      (element as any).context = null;

      stack.push(element);
    }

    if (!stack.length) {
      return null;
    }

    if (stack[0] && stack[0].line && !stack[0].column && reference) {
      stack[0].column = null;
    }

    return {
      mode: 'stack',
      name: ex.name,
      message: ex.message,
      stack: stack,
    };
  }

  /**
   * Computes stack trace information from the stacktrace property.
   * Opera 10+ uses this property.
   * @param {Error} ex
   * @return {?TraceKit.StackTrace} Stack trace information.
   * @memberof TraceKit._computeStackTrace
   */
  function _computeStackTraceFromStacktraceProp(ex: any) {
    // Access and store the stacktrace property before doing ANYTHING
    // else to it because Opera is not very good at providing it
    // reliably in other circumstances.
    var stacktrace = ex.stacktrace;
    if (!stacktrace) {
      return;
    }

    var opera10Regex = / line (\d+).*script (?:in )?(\S+)(?:: in function (\S+))?$/i,
      opera11Regex = / line (\d+), column (\d+)\s*(?:in (?:<anonymous function: ([^>]+)>|([^\)]+))\((.*)\))? in (.*):\s*$/i,
      lines = stacktrace.split('\n'),
      stack = [],
      parts;

    for (var line = 0; line < lines.length; line += 2) {
      var element = null;
      if ((parts = opera10Regex.exec(lines[line]))) {
        element = {
          url: parts[2],
          line: +parts[1],
          column: null,
          func: parts[3],
          args: [],
        };
      } else if ((parts = opera11Regex.exec(lines[line]))) {
        element = {
          url: parts[6],
          line: +parts[1],
          column: +parts[2],
          func: parts[3] || parts[4],
          args: parts[5] ? parts[5].split(',') : [],
        };
      }

      if (element) {
        if (!element.func && element.line) {
          element.func = UNKNOWN_FUNCTION;
        }
        if (element.line) {
          (element as any).context = null;
        }

        if (!(element as any).context) {
          (element as any).context = [lines[line + 1]];
        }

        stack.push(element);
      }
    }

    if (!stack.length) {
      return null;
    }

    return {
      mode: 'stacktrace',
      name: ex.name,
      message: ex.message,
      stack: stack,
    };
  }

  /**
   * NOT TESTED.
   * Computes stack trace information from an error message that includes
   * the stack trace.
   * Opera 9 and earlier use this method if the option to show stack
   * traces is turned on in opera:config.
   * @param {Error} ex
   * @return {?TraceKit.StackTrace} Stack information.
   * @memberof TraceKit._computeStackTrace
   */
  function _computeStackTraceFromOperaMultiLineMessage(ex: any) {
    // TODO: Clean this function up
    // Opera includes a stack trace into the exception message. An example is:
    //
    // Statement on line 3: Undefined variable: undefinedFunc
    // Backtrace:
    //   Line 3 of linked script file://localhost/Users/andreyvit/Projects/TraceKit/javascript-client/sample.js: In function zzz
    //         undefinedFunc(a);
    //   Line 7 of inline#1 script in file://localhost/Users/andreyvit/Projects/TraceKit/javascript-client/sample.html: In function yyy
    //           zzz(x, y, z);
    //   Line 3 of inline#1 script in file://localhost/Users/andreyvit/Projects/TraceKit/javascript-client/sample.html: In function xxx
    //           yyy(a, a, a);
    //   Line 1 of function script
    //     try { xxx('hi'); return false; } catch(ex) { TraceKit.report(ex); }
    //   ...

    var lines = ex.message.split('\n');
    if (lines.length < 4) {
      return null;
    }

    var lineRE1 = /^\s*Line (\d+) of linked script ((?:file|https?|blob)\S+)(?:: in function (\S+))?\s*$/i,
      lineRE2 = /^\s*Line (\d+) of inline#(\d+) script in ((?:file|https?|blob)\S+)(?:: in function (\S+))?\s*$/i,
      lineRE3 = /^\s*Line (\d+) of function script\s*$/i,
      stack = [],
      scripts = window && window.document && window.document.getElementsByTagName('script'),
      inlineScriptBlocks = [],
      parts;

    for (var s in scripts) {
      if (_has(scripts, s) && !scripts[s].src) {
        inlineScriptBlocks.push(scripts[s]);
      }
    }

    for (var line = 2; line < lines.length; line += 2) {
      var item = null;
      if ((parts = lineRE1.exec(lines[line]))) {
        item = {
          url: parts[2],
          func: parts[3],
          args: [],
          line: +parts[1],
          column: null,
        };
      } else if ((parts = lineRE2.exec(lines[line]))) {
        item = {
          url: parts[3],
          func: parts[4],
          args: [],
          line: +parts[1],
          column: null, // TODO: Check to see if inline#1 (+parts[2]) points to the script number or column number.
        };
      } else if ((parts = lineRE3.exec(lines[line]))) {
        var url = getLocationHref().replace(/#.*$/, '');
        item = {
          url: url,
          func: '',
          args: [],
          line: parts[1],
          column: null,
        };
      }

      if (item) {
        if (!item.func) {
          item.func = UNKNOWN_FUNCTION;
        }
        // if (context) alert("Context mismatch. Correct midline:\n" + lines[i+1] + "\n\nMidline:\n" + midline + "\n\nContext:\n" + context.join("\n") + "\n\nURL:\n" + item.url);
        (item as any).context = [lines[line + 1]];
        stack.push(item);
      }
    }
    if (!stack.length) {
      return null; // could not parse multiline exception message as Opera stack trace
    }

    return {
      mode: 'multiline',
      name: ex.name,
      message: lines[0],
      stack: stack,
    };
  }

  /**
   * Adds information about the first frame to incomplete stack traces.
   * Safari and IE require this to get complete data on the first frame.
   * @param {TraceKit.StackTrace} stackInfo Stack trace information from
   * one of the compute* methods.
   * @param {string} url The URL of the script that caused an error.
   * @param {(number|string)} lineNo The line number of the script that
   * caused an error.
   * @param {string=} message The error generated by the browser, which
   * hopefully contains the name of the object that caused the error.
   * @return {boolean} Whether or not the stack information was
   * augmented.
   * @memberof TraceKit._computeStackTrace
   */
  function _augmentStackTraceWithInitialElement(stackInfo: any, url: any, lineNo: any, message: any) {
    var initial = {
      url: url,
      line: lineNo,
    };

    if (initial.url && initial.line) {
      stackInfo.incomplete = false;

      if (!(initial as any).func) {
        (initial as any).func = UNKNOWN_FUNCTION;
      }

      if (!(initial as any).context) {
        (initial as any).context = null;
      }

      var reference = / '([^']+)' /.exec(message);
      if (reference) {
        (initial as any).column = null;
      }

      if (stackInfo.stack.length > 0) {
        if (stackInfo.stack[0].url === initial.url) {
          if (stackInfo.stack[0].line === initial.line) {
            return false; // already in stack trace
          } else if (!stackInfo.stack[0].line && stackInfo.stack[0].func === (initial as any).func) {
            stackInfo.stack[0].line = initial.line;
            stackInfo.stack[0].context = (initial as any).context;
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
   * @return {TraceKit.StackTrace=} Stack trace information.
   * @memberof TraceKit._computeStackTrace
   */
  function _computeStackTraceByWalkingCallerChain(ex: any, depth: any) {
    var functionName = /function\s+([_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*)?\s*\(/i,
      stack = [],
      funcs = {},
      recursion = false,
      parts,
      item;

    for (var curr = _computeStackTraceByWalkingCallerChain.caller; curr && !recursion; curr = curr.caller) {
      if (curr === _computeStackTrace || curr === TraceKit._report) {
        continue;
      }

      item = {
        url: null,
        func: UNKNOWN_FUNCTION,
        args: [],
        line: null,
        column: null,
      };

      if (curr.name) {
        item.func = curr.name;
      } else if ((parts = functionName.exec(curr.toString()))) {
        item.func = parts[1];
      }

      if (typeof item.func === 'undefined') {
        try {
          item.func = (parts as any).input.substring(0, (parts as any).input.indexOf('{'));
        } catch (e) {}
      }

      if ((funcs as any)['' + curr]) {
        recursion = true;
      } else {
        (funcs as any)['' + curr] = true;
      }

      stack.push(item);
    }

    if (depth) {
      stack.splice(0, depth);
    }

    var result = {
      mode: 'callers',
      name: ex.name,
      message: ex.message,
      stack: stack,
    };
    _augmentStackTraceWithInitialElement(
      result,
      ex.sourceURL || ex.fileName,
      ex.line || ex.lineNumber,
      ex.message || ex.description,
    );
    return result;
  }

  /**
   * Computes a stack trace for an exception.
   * @param {Error} ex
   * @param {(string|number)=} depth
   * @memberof TraceKit._computeStackTrace
   */
  function computeStackTrace(ex: any, depth: any) {
    var stack = null;
    depth = depth == null ? 0 : +depth;

    try {
      // This must be tried first because Opera 10 *destroys*
      // its stacktrace property if you try to access the stack
      // property first!!
      stack = _computeStackTraceFromStacktraceProp(ex);
      if (stack) {
        return stack;
      }
    } catch (e) {}

    try {
      stack = _computeStackTraceFromStackProp(ex);
      if (stack) {
        return stack;
      }
    } catch (e) {}

    try {
      stack = _computeStackTraceFromOperaMultiLineMessage(ex);
      if (stack) {
        return stack;
      }
    } catch (e) {}

    try {
      stack = _computeStackTraceByWalkingCallerChain(ex, depth + 1);
      if (stack) {
        return stack;
      }
    } catch (e) {}

    return {
      original: ex,
      name: ex.name,
      message: ex.message,
      mode: 'failed',
    };
  }

  (computeStackTrace as any)._augmentStackTraceWithInitialElement = _augmentStackTraceWithInitialElement;
  (computeStackTrace as any)._computeStackTraceFromStackProp = _computeStackTraceFromStackProp;

  return computeStackTrace;
})();

TraceKit._collectWindowErrors = true;
TraceKit._linesOfContext = 11;

const _subscribe = TraceKit._report._subscribe;
const _installGlobalHandler = TraceKit._report._installGlobalHandler;
const _installGlobalUnhandledRejectionHandler = TraceKit._report._installGlobalUnhandledRejectionHandler;
const _computeStackTrace: ComputeStackTrace = TraceKit._computeStackTrace;

export { _subscribe, _installGlobalHandler, _installGlobalUnhandledRejectionHandler, _computeStackTrace };
