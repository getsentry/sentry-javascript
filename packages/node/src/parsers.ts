import { Event, Exception, ExtendedError, StackFrame } from '@sentry/types';
import { addContextToFrame, basename, dirname, SyncPromise } from '@sentry/utils';
import { readFile } from 'fs';
import { LRUMap } from 'lru_map';

import * as stacktrace from './stacktrace';
import { NodeOptions } from './types';

const DEFAULT_LINES_OF_CONTEXT: number = 7;
const FILE_CONTENT_CACHE = new LRUMap<string, string | null>(100);

/**
 * Resets the file cache. Exists for testing purposes.
 * @hidden
 */
export function resetFileContentCache(): void {
  FILE_CONTENT_CACHE.clear();
}

/** JSDoc */
function getFunction(frame: stacktrace.StackFrame): string {
  try {
    return frame.functionName || `${frame.typeName}.${frame.methodName || '<anonymous>'}`;
  } catch (e) {
    // This seems to happen sometimes when using 'use strict',
    // stemming from `getTypeName`.
    // [TypeError: Cannot read property 'constructor' of undefined]
    return '<anonymous>';
  }
}

const mainModule: string = `${(require.main && require.main.filename && dirname(require.main.filename)) ||
  global.process.cwd()}/`;

/** JSDoc */
function getModule(filename: string, base?: string): string {
  if (!base) {
    // eslint-disable-next-line no-param-reassign
    base = mainModule;
  }

  // It's specifically a module
  const file = basename(filename, '.js');
  // eslint-disable-next-line no-param-reassign
  filename = dirname(filename);
  let n = filename.lastIndexOf('/node_modules/');
  if (n > -1) {
    // /node_modules/ is 14 chars
    return `${filename.substr(n + 14).replace(/\//g, '.')}:${file}`;
  }
  // Let's see if it's a part of the main module
  // To be a part of main module, it has to share the same base
  n = `${filename}/`.lastIndexOf(base, 0);
  if (n === 0) {
    let moduleName = filename.substr(base.length).replace(/\//g, '.');
    if (moduleName) {
      moduleName += ':';
    }
    moduleName += file;
    return moduleName;
  }
  return file;
}

/**
 * This function reads file contents and caches them in a global LRU cache.
 * Returns a Promise filepath => content array for all files that we were able to read.
 *
 * @param filenames Array of filepaths to read content from.
 */
function readSourceFiles(filenames: string[]): PromiseLike<{ [key: string]: string | null }> {
  // we're relying on filenames being de-duped already
  if (filenames.length === 0) {
    return SyncPromise.resolve({});
  }

  return new SyncPromise<{
    [key: string]: string | null;
  }>(resolve => {
    const sourceFiles: {
      [key: string]: string | null;
    } = {};

    let count = 0;
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < filenames.length; i++) {
      const filename = filenames[i];

      const cache = FILE_CONTENT_CACHE.get(filename);
      // We have a cache hit
      if (cache !== undefined) {
        // If it's not null (which means we found a file and have a content)
        // we set the content and return it later.
        if (cache !== null) {
          sourceFiles[filename] = cache;
        }
        // eslint-disable-next-line no-plusplus
        count++;
        // In any case we want to skip here then since we have a content already or we couldn't
        // read the file and don't want to try again.
        if (count === filenames.length) {
          resolve(sourceFiles);
        }
        continue;
      }

      readFile(filename, (err: Error | null, data: Buffer) => {
        const content = err ? null : data.toString();
        sourceFiles[filename] = content;

        // We always want to set the cache, even to null which means there was an error reading the file.
        // We do not want to try to read the file again.
        FILE_CONTENT_CACHE.set(filename, content);
        // eslint-disable-next-line no-plusplus
        count++;
        if (count === filenames.length) {
          resolve(sourceFiles);
        }
      });
    }
  });
}

/**
 * @hidden
 */
export function extractStackFromError(error: Error): stacktrace.StackFrame[] {
  const stack = stacktrace.parse(error);
  if (!stack) {
    return [];
  }
  return stack;
}

/**
 * @hidden
 */
export function parseStack(stack: stacktrace.StackFrame[], options?: NodeOptions): PromiseLike<StackFrame[]> {
  const filesToRead: string[] = [];

  const linesOfContext =
    options && options.frameContextLines !== undefined ? options.frameContextLines : DEFAULT_LINES_OF_CONTEXT;

  const frames: StackFrame[] = stack.map(frame => {
    const parsedFrame: StackFrame = {
      colno: frame.columnNumber,
      filename: frame.fileName?.startsWith('file://') ? frame.fileName.substr(7) : frame.fileName || '',
      function: getFunction(frame),
      lineno: frame.lineNumber,
    };

    const isInternal =
      frame.native ||
      (parsedFrame.filename &&
        !parsedFrame.filename.startsWith('/') &&
        !parsedFrame.filename.startsWith('.') &&
        parsedFrame.filename.indexOf(':\\') !== 1);

    // in_app is all that's not an internal Node function or a module within node_modules
    // note that isNative appears to return true even for node core libraries
    // see https://github.com/getsentry/raven-node/issues/176
    parsedFrame.in_app =
      !isInternal && parsedFrame.filename !== undefined && parsedFrame.filename.indexOf('node_modules/') === -1;

    // Extract a module name based on the filename
    if (parsedFrame.filename) {
      parsedFrame.module = getModule(parsedFrame.filename);

      if (!isInternal && linesOfContext > 0 && filesToRead.indexOf(parsedFrame.filename) === -1) {
        filesToRead.push(parsedFrame.filename);
      }
    }

    return parsedFrame;
  });

  // We do an early return if we do not want to fetch context liens
  if (linesOfContext <= 0) {
    return SyncPromise.resolve(frames);
  }

  try {
    return addPrePostContext(filesToRead, frames, linesOfContext);
  } catch (_) {
    // This happens in electron for example where we are not able to read files from asar.
    // So it's fine, we recover be just returning all frames without pre/post context.
    return SyncPromise.resolve(frames);
  }
}

/**
 * This function tries to read the source files + adding pre and post context (source code)
 * to a frame.
 * @param filesToRead string[] of filepaths
 * @param frames StackFrame[] containg all frames
 */
function addPrePostContext(
  filesToRead: string[],
  frames: StackFrame[],
  linesOfContext: number,
): PromiseLike<StackFrame[]> {
  return new SyncPromise<StackFrame[]>(resolve =>
    readSourceFiles(filesToRead).then(sourceFiles => {
      const result = frames.map(frame => {
        if (frame.filename && sourceFiles[frame.filename]) {
          try {
            const lines = (sourceFiles[frame.filename] as string).split('\n');

            addContextToFrame(lines, frame, linesOfContext);
          } catch (e) {
            // anomaly, being defensive in case
            // unlikely to ever happen in practice but can definitely happen in theory
          }
        }
        return frame;
      });

      resolve(result);
    }),
  );
}

/**
 * @hidden
 */
export function getExceptionFromError(error: Error, options?: NodeOptions): PromiseLike<Exception> {
  const name = error.name || error.constructor.name;
  const stack = extractStackFromError(error);
  return new SyncPromise<Exception>(resolve =>
    parseStack(stack, options).then(frames => {
      const result = {
        stacktrace: {
          frames: prepareFramesForEvent(frames),
        },
        type: name,
        value: error.message,
      };
      resolve(result);
    }),
  );
}

/**
 * @hidden
 */
export function parseError(error: ExtendedError, options?: NodeOptions): PromiseLike<Event> {
  return new SyncPromise<Event>(resolve =>
    getExceptionFromError(error, options).then((exception: Exception) => {
      resolve({
        exception: {
          values: [exception],
        },
      });
    }),
  );
}

/**
 * @hidden
 */
export function prepareFramesForEvent(stack: StackFrame[]): StackFrame[] {
  if (!stack || !stack.length) {
    return [];
  }

  let localStack = stack;
  const firstFrameFunction = localStack[0].function || '';

  if (firstFrameFunction.indexOf('captureMessage') !== -1 || firstFrameFunction.indexOf('captureException') !== -1) {
    localStack = localStack.slice(1);
  }

  // The frame where the crash happened, should be the last entry in the array
  return localStack.reverse();
}
