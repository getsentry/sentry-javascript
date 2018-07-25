import { SentryEvent, StackFrame } from '@sentry/types';
import { readFileAsync } from '@sentry/utils/fs';
import { snipLine } from '@sentry/utils/string';
import { basename, dirname } from 'path';
import * as stacktrace from 'stack-trace';

const LINES_OF_CONTEXT: number = 7;

/**
 * Just an Error object with arbitrary attributes attached to it.
 */
interface ExtendedError extends Error {
  [key: string]: any;
}

/**
 * TODO
 */
function getFunction(frame: stacktrace.StackFrame): string {
  try {
    return frame.getFunctionName() || `${frame.getTypeName()}.${frame.getMethodName() || '<anonymous>'}`;
  } catch (e) {
    // This seems to happen sometimes when using 'use strict',
    // stemming from `getTypeName`.
    // [TypeError: Cannot read property 'constructor' of undefined]
    return '<anonymous>';
  }
}

/**
 * TODO
 */
function getTransaction(frame: StackFrame): string {
  return frame.module || frame.function ? `${frame.module || '?'} at ${frame.function || '?'}` : '<unknown>';
}

const mainModule: string = `${(require.main && require.main.filename && dirname(require.main.filename)) ||
  global.process.cwd()}/`;

/**
 * TODO
 */
function getModule(filename: string, base?: string): string {
  if (!base) {
    base = mainModule; // tslint:disable-line:no-parameter-reassignment
  }

  // It's specifically a module
  const file = basename(filename, '.js');
  filename = dirname(filename); // tslint:disable-line:no-parameter-reassignment
  let n = filename.lastIndexOf('/node_modules/');
  if (n > -1) {
    // /node_modules/ is 14 chars
    return `${filename.substr(n + 14).replace(/\//g, '.')}:${file}`;
  }
  // Let's see if it's a part of the main module
  // To be a part of main module, it has to share the same base
  n = `${filename}/`.lastIndexOf(base, 0);
  if (n === 0) {
    let module = filename.substr(base.length).replace(/\//g, '.');
    if (module) {
      module += ':';
    }
    module += file;
    return module;
  }
  return file;
}

/**
 * TODO
 */
async function readSourceFiles(
  filenames: string[],
): Promise<{
  [key: string]: string;
}> {
  // we're relying on filenames being de-duped already
  if (filenames.length === 0) {
    return {};
  }

  const sourceFiles: {
    [key: string]: string;
  } = {};

  await Promise.all(
    filenames.map(async filename => {
      const content = await readFileAsync(filename);
      if (typeof content === 'string') {
        sourceFiles[filename] = content;
      }
    }),
  );

  return sourceFiles;
}

/**
 * TODO
 */
export async function extractStackFromError(error: Error): Promise<stacktrace.StackFrame[]> {
  const stack = stacktrace.parse(error);
  if (!stack) {
    return [];
  }
  return stack;
}

/**
 * TODO
 */
export async function parseStack(stack: stacktrace.StackFrame[]): Promise<StackFrame[]> {
  const filesToRead: string[] = [];
  const frames: StackFrame[] = stack.map(frame => {
    const parsedFrame: StackFrame = {
      colno: frame.getColumnNumber(),
      filename: frame.getFileName() || '',
      function: getFunction(frame),
      lineno: frame.getLineNumber(),
    };

    const isInternal =
      frame.isNative() ||
      (parsedFrame.filename &&
        !parsedFrame.filename.startsWith('/') &&
        !parsedFrame.filename.startsWith('.') &&
        parsedFrame.filename.indexOf(':\\') !== 1);

    // in_app is all that's not an internal Node function or a module within node_modules
    // note that isNative appears to return true even for node core libraries
    // see https://github.com/getsentry/raven-node/issues/176
    parsedFrame.in_app =
      !isInternal && parsedFrame.filename !== undefined && !parsedFrame.filename.includes('node_modules/');

    // Extract a module name based on the filename
    if (parsedFrame.filename) {
      parsedFrame.module = getModule(parsedFrame.filename);

      if (!isInternal) {
        filesToRead.push(parsedFrame.filename);
      }
    }

    return parsedFrame;
  });

  const sourceFiles = await readSourceFiles(filesToRead);

  return frames.map(frame => {
    if (frame.filename && sourceFiles[frame.filename]) {
      try {
        const lines = sourceFiles[frame.filename].split('\n');

        frame.pre_context = lines
          .slice(Math.max(0, (frame.lineno || 0) - (LINES_OF_CONTEXT + 1)), (frame.lineno || 0) - 1)
          .map((line: string) => snipLine(line, 0));

        frame.context_line = snipLine(lines[(frame.lineno || 0) - 1], frame.colno || 0);

        frame.post_context = lines
          .slice(frame.lineno || 0, (frame.lineno || 0) + LINES_OF_CONTEXT)
          .map((line: string) => snipLine(line, 0));
      } catch (e) {
        // anomaly, being defensive in case
        // unlikely to ever happen in practice but can definitely happen in theory
      }
    }
    return frame;
  });
}

/**
 * TODO
 */
export async function parseError(error: ExtendedError): Promise<SentryEvent> {
  const name = error.name || error.constructor.name;
  const stack = await extractStackFromError(error);
  const frames = await parseStack(stack);
  const event: SentryEvent = {
    exception: {
      values: [
        {
          stacktrace: {
            frames: prepareFramesForEvent(frames),
          },
          type: name,
          value: error.message,
        },
      ],
    },
    message: `${name}: ${error.message || '<no message>'}`,
  };
  const errorKeys = Object.keys(error).filter(key => !(key in ['name', 'message', 'stack', 'domain']));

  if (errorKeys.length) {
    const extraErrorInfo: { [key: string]: any } = {};
    for (const key of errorKeys) {
      extraErrorInfo[key] = error[key];
    }
    event.extra = {
      [name]: extraErrorInfo,
    };
  }

  // use for loop so we don't have to reverse whole frames array
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];

    if (frame.in_app === true) {
      event.transaction = getTransaction(frame);
      break;
    }
  }

  return event;
}

/**
 * TODO
 */
export function prepareFramesForEvent(stack: StackFrame[]): StackFrame[] {
  if (!stack) {
    return [];
  }

  let localStack = stack;
  const firstFrameFunction = localStack[0].function || '';

  // TODO: This could be smarter
  if (firstFrameFunction.includes('captureMessage') || firstFrameFunction.includes('captureException')) {
    localStack = localStack.slice(1);
  }

  return localStack;
  // Sentry expects the stack trace to be oldest -> newest, v8 provides newest -> oldest
  // return filteredFrames.reverse();
}
