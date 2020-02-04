// tslint:disable:object-literal-sort-keys

/**
 * This was originally forked from https://github.com/occ/TraceKit, but has since been
 * largely modified and is now maintained as part of Sentry JS SDK.
 */

/**
 * An object representing a single stack frame.
 * {Object} StackFrame
 * {string} url The JavaScript or HTML file URL.
 * {string} func The function name, or empty for anonymous functions (if guessing did not work).
 * {string[]?} args The arguments passed to the function, if known.
 * {number=} line The line number, if known.
 * {number=} column The column number, if known.
 * {string[]} context An array of source code lines; the middle element corresponds to the correct line#.
 */
export interface StackFrame {
  url: string;
  func: string;
  args: string[];
  line: number | null;
  column: number | null;
}

/**
 * An object representing a JavaScript stack trace.
 * {Object} StackTrace
 * {string} name The name of the thrown exception.
 * {string} message The exception error message.
 * {TraceKit.StackFrame[]} stack An array of stack frames.
 */
export interface StackTrace {
  name: string;
  message: string;
  mechanism?: string;
  stack: StackFrame[];
  failed?: boolean;
}

// global reference to slice
const UNKNOWN_FUNCTION = '?';

// Chromium based browsers: Chrome, Brave, new Opera, new Edge
const chrome = /^\s*at (?:(.*?) ?\()?((?:file|https?|blob|chrome-extension|address|native|eval|webpack|<anonymous>|[-a-z]+:|.*bundle|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i;
// gecko regex: `(?:bundle|\d+\.js)`: `bundle` is for react native, `\d+\.js` also but specifically for ram bundles because it
// generates filenames without a prefix like `file://` the filenames in the stacktrace are just 42.js
// We need this specific case for now because we want no other regex to match.
const gecko = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:file|https?|blob|chrome|webpack|resource|moz-extension).*?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js))(?::(\d+))?(?::(\d+))?\s*$/i;
const winjs = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i;
const geckoEval = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i;
const chromeEval = /\((\S*)(?::(\d+))(?::(\d+))\)/;

/** JSDoc */
export function computeStackTrace(ex: any): StackTrace {
  // tslint:disable:no-unsafe-any

  let stack = null;
  const popSize: number = ex && ex.framesToPop;

  try {
    // This must be tried first because Opera 10 *destroys*
    // its stacktrace property if you try to access the stack
    // property first!!
    stack = computeStackTraceFromStacktraceProp(ex);
    if (stack) {
      return popFrames(stack, popSize);
    }
  } catch (e) {
    // no-empty
  }

  try {
    stack = computeStackTraceFromStackProp(ex);
    if (stack) {
      return popFrames(stack, popSize);
    }
  } catch (e) {
    // no-empty
  }

  return {
    message: extractMessage(ex),
    name: ex && ex.name,
    stack: [],
    failed: true,
  };
}

/** JSDoc */
// tslint:disable-next-line:cyclomatic-complexity
function computeStackTraceFromStackProp(ex: any): StackTrace | null {
  // tslint:disable:no-conditional-assignment
  if (!ex || !ex.stack) {
    return null;
  }

  const stack = [];
  const lines = ex.stack.split('\n');
  let isEval;
  let submatch;
  let parts;
  let element;

  for (let i = 0; i < lines.length; ++i) {
    if ((parts = chrome.exec(lines[i]))) {
      const isNative = parts[2] && parts[2].indexOf('native') === 0; // start of line
      isEval = parts[2] && parts[2].indexOf('eval') === 0; // start of line
      if (isEval && (submatch = chromeEval.exec(parts[2]))) {
        // throw out eval line/column and use top-most line/column number
        parts[2] = submatch[1]; // url
        parts[3] = submatch[2]; // line
        parts[4] = submatch[3]; // column
      }
      element = {
        // working with the regexp above is super painful. it is quite a hack, but just stripping the `address at `
        // prefix here seems like the quickest solution for now.
        url: parts[2] && parts[2].indexOf('address at ') === 0 ? parts[2].substr('address at '.length) : parts[2],
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
        stack[0].column = (ex.columnNumber as number) + 1;
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

    stack.push(element);
  }

  if (!stack.length) {
    return null;
  }

  return {
    message: extractMessage(ex),
    name: ex.name,
    stack,
  };
}

/** JSDoc */
function computeStackTraceFromStacktraceProp(ex: any): StackTrace | null {
  if (!ex || !ex.stacktrace) {
    return null;
  }
  // Access and store the stacktrace property before doing ANYTHING
  // else to it because Opera is not very good at providing it
  // reliably in other circumstances.
  const stacktrace = ex.stacktrace;
  const opera10Regex = / line (\d+).*script (?:in )?(\S+)(?:: in function (\S+))?$/i;
  const opera11Regex = / line (\d+), column (\d+)\s*(?:in (?:<anonymous function: ([^>]+)>|([^\)]+))\((.*)\))? in (.*):\s*$/i;
  const lines = stacktrace.split('\n');
  const stack = [];
  let parts;

  for (let line = 0; line < lines.length; line += 2) {
    // tslint:disable:no-conditional-assignment
    let element = null;
    if ((parts = opera10Regex.exec(lines[line]))) {
      element = {
        url: parts[2],
        func: parts[3],
        args: [],
        line: +parts[1],
        column: null,
      };
    } else if ((parts = opera11Regex.exec(lines[line]))) {
      element = {
        url: parts[6],
        func: parts[3] || parts[4],
        args: parts[5] ? parts[5].split(',') : [],
        line: +parts[1],
        column: +parts[2],
      };
    }

    if (element) {
      if (!element.func && element.line) {
        element.func = UNKNOWN_FUNCTION;
      }
      stack.push(element);
    }
  }

  if (!stack.length) {
    return null;
  }

  return {
    message: extractMessage(ex),
    name: ex.name,
    stack,
  };
}

/** Remove N number of frames from the stack */
function popFrames(stacktrace: StackTrace, popSize: number): StackTrace {
  try {
    return {
      ...stacktrace,
      stack: stacktrace.stack.slice(popSize),
    };
  } catch (e) {
    return stacktrace;
  }
}

/**
 * There are cases where stacktrace.message is an Event object
 * https://github.com/getsentry/sentry-javascript/issues/1949
 * In this specific case we try to extract stacktrace.message.error.message
 */
function extractMessage(ex: any): string {
  const message = ex && ex.message;
  if (!message) {
    return 'No error message';
  }
  if (message.error && typeof message.error.message === 'string') {
    return message.error.message;
  }
  return message;
}
