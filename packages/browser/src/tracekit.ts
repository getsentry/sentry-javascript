/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { StackFrame } from '@sentry/types';

// global reference to slice
const UNKNOWN_FUNCTION = '?';

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
  stack: StackFrame[];
}

type StackLineParser = (line: string) => StackFrame | undefined;

// Chromium based browsers: Chrome, Brave, new Opera, new Edge
const chromeRegex =
  /^\s*at (?:(.*?) ?\((?:address at )?)?((?:file|https?|blob|chrome-extension|address|native|eval|webpack|<anonymous>|[-a-z]+:|.*bundle|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i;
const chromeEvalRegex = /\((\S*)(?::(\d+))(?::(\d+))\)/;

const chrome: StackLineParser = line => {
  const parts = chromeRegex.exec(line);

  if (parts) {
    const isEval = parts[2] && parts[2].indexOf('eval') === 0; // start of line

    if (isEval) {
      const subMatch = chromeEvalRegex.exec(parts[2]);

      if (subMatch) {
        // throw out eval line/column and use top-most line/column number
        parts[2] = subMatch[1]; // url
        parts[3] = subMatch[2]; // line
        parts[4] = subMatch[3]; // column
      }
    }

    // Kamil: One more hack won't hurt us right? Understanding and adding more rules on top of these regexps right now
    // would be way too time consuming. (TODO: Rewrite whole RegExp to be more readable)
    const [func, filename] = extractSafariExtensionDetails(parts[1] || UNKNOWN_FUNCTION, parts[2]);

    return {
      filename,
      function: func,
      lineno: parts[3] ? +parts[3] : undefined,
      colno: parts[4] ? +parts[4] : undefined,
    };
  }

  return;
};

// gecko regex: `(?:bundle|\d+\.js)`: `bundle` is for react native, `\d+\.js` also but specifically for ram bundles because it
// generates filenames without a prefix like `file://` the filenames in the stacktrace are just 42.js
// We need this specific case for now because we want no other regex to match.
const geckoREgex =
  /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:file|https?|blob|chrome|webpack|resource|moz-extension|capacitor).*?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js)|\/[\w\-. /=]+)(?::(\d+))?(?::(\d+))?\s*$/i;
const geckoEvalRegex = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i;

const gecko: StackLineParser = line => {
  const parts = geckoREgex.exec(line);

  if (parts) {
    const isEval = parts[3] && parts[3].indexOf(' > eval') > -1;
    if (isEval) {
      const subMatch = geckoEvalRegex.exec(parts[3]);

      if (subMatch) {
        // throw out eval line/column and use top-most line number
        parts[1] = parts[1] || `eval`;
        parts[3] = subMatch[1];
        parts[4] = subMatch[2];
        parts[5] = ''; // no column when eval
      }
    }

    let filename = parts[3];
    let func = parts[1] || UNKNOWN_FUNCTION;
    [func, filename] = extractSafariExtensionDetails(func, filename);

    return {
      filename,
      function: func,
      lineno: parts[4] ? +parts[4] : undefined,
      colno: parts[5] ? +parts[5] : undefined,
    };
  }

  return;
};

const winjsRegex =
  /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i;

const winjs: StackLineParser = line => {
  const parts = winjsRegex.exec(line);

  return parts
    ? {
        filename: parts[2],
        function: parts[1] || UNKNOWN_FUNCTION,
        lineno: +parts[3],
        colno: parts[4] ? +parts[4] : undefined,
      }
    : undefined;
};

const opera10Regex = / line (\d+).*script (?:in )?(\S+)(?:: in function (\S+))?$/i;

const opera10: StackLineParser = line => {
  const parts = opera10Regex.exec(line);

  return parts
    ? {
        filename: parts[2],
        function: parts[3] || UNKNOWN_FUNCTION,
        lineno: +parts[1],
      }
    : undefined;
};

const opera11Regex =
  / line (\d+), column (\d+)\s*(?:in (?:<anonymous function: ([^>]+)>|([^)]+))\(.*\))? in (.*):\s*$/i;

const opera11: StackLineParser = line => {
  const parts = opera11Regex.exec(line);

  return parts
    ? {
        filename: parts[5],
        function: parts[3] || parts[4] || UNKNOWN_FUNCTION,
        lineno: +parts[1],
        colno: +parts[2],
      }
    : undefined;
};

// Based on our own mapping pattern - https://github.com/getsentry/sentry/blob/9f08305e09866c8bd6d0c24f5b0aabdd7dd6c59c/src/sentry/lang/javascript/errormapping.py#L83-L108
const reactMinifiedRegexp = /Minified React error #\d+;/i;

/** JSDoc */
export function computeStackTrace(ex: Error & { framesToPop?: number; stacktrace?: string }): StackTrace {
  let frames: StackFrame[] = [];
  let popSize = 0;

  if (ex) {
    if (typeof ex.framesToPop === 'number') {
      popSize = ex.framesToPop;
    } else if (reactMinifiedRegexp.test(ex.message)) {
      popSize = 1;
    }
  }

  try {
    // Access and store the stacktrace property before doing ANYTHING
    // else to it because Opera is not very good at providing it
    // reliably in other circumstances.
    const stacktrace = ex.stacktrace || ex.stack || '';

    for (const line of stacktrace.split('\n')) {
      for (const parser of [opera10, opera11, chrome, winjs, gecko]) {
        const frame = parser(line);

        if (frame) {
          frames.push(frame);
          break;
        }
      }
    }
  } catch (e) {
    // no-empty
  }

  if (frames.length && popSize > 0) {
    frames = frames.slice(popSize);
  }

  return {
    message: extractMessage(ex),
    name: ex && ex.name,
    stack: frames,
  };
}

/**
 * Safari web extensions, starting version unknown, can produce "frames-only" stacktraces.
 * What it means, is that instead of format like:
 *
 * Error: wat
 *   at function@url:row:col
 *   at function@url:row:col
 *   at function@url:row:col
 *
 * it produces something like:
 *
 *   function@url:row:col
 *   function@url:row:col
 *   function@url:row:col
 *
 * Because of that, it won't be captured by `chrome` RegExp and will fall into `Gecko` branch.
 * This function is extracted so that we can use it in both places without duplicating the logic.
 * Unfortunatelly "just" changing RegExp is too complicated now and making it pass all tests
 * and fix this case seems like an impossible, or at least way too time-consuming task.
 */
const extractSafariExtensionDetails = (func: string, filename: string): [string, string] => {
  const isSafariExtension = func.indexOf('safari-extension') !== -1;
  const isSafariWebExtension = func.indexOf('safari-web-extension') !== -1;

  return isSafariExtension || isSafariWebExtension
    ? [
        func.indexOf('@') !== -1 ? func.split('@')[0] : UNKNOWN_FUNCTION,
        isSafariExtension ? `safari-extension:${filename}` : `safari-web-extension:${filename}`,
      ]
    : [func, filename];
};

/**
 * There are cases where stacktrace.message is an Event object
 * https://github.com/getsentry/sentry-javascript/issues/1949
 * In this specific case we try to extract stacktrace.message.error.message
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
