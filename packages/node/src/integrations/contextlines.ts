import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { defineIntegration } from '@sentry/core';
import type { Event, IntegrationFn, StackFrame } from '@sentry/types';
import { logger, LRUMap, snipLine } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';

const LRU_FILE_CONTENTS_CACHE = new LRUMap<string, Record<number, string>>(10);
const DEFAULT_LINES_OF_CONTEXT = 7;
const INTEGRATION_NAME = 'ContextLines';

interface ContextLinesOptions {
  /**
   * Sets the number of context lines for each frame when loading a file.
   * Defaults to 7.
   *
   * Set to 0 to disable loading and inclusion of source files.
   **/
  frameContextLines?: number;
}

/**
 * Exported for testing purposes.
 */
export function resetFileContentCache(): void {
  LRU_FILE_CONTENTS_CACHE.clear();
}

/**
 * Determines if context lines should be skipped for a file.
 * - .min.(mjs|cjs|js) files are and not useful since they dont point to the original source
 * - node: prefixed modules are part of the runtime and cannot be resolved to a file
 * - data: skip json, wasm and inline js https://nodejs.org/api/esm.html#data-imports
 */
const SKIP_CONTEXTLINES_REGEXP = /^(node|data):|\.min\.(mjs|cjs|js$)/;
function shouldSkipContextLinesForFile(path: string): boolean {
  return SKIP_CONTEXTLINES_REGEXP.test(path);
}
/**
 * Checks if we have all the contents that we need in the cache.
 */
function rangeExistsInContentCache(file: string, range: ReadlineRange): boolean {
  const contents = LRU_FILE_CONTENTS_CACHE.get(file);
  if (!contents) return false;

  for (let i = range[0]; i <= range[1]; i++) {
    if (contents[i] === undefined) {
      return false;
    }
  }

  return true;
}

/**
 * Creates contiguous ranges of lines to read from a file. In the case where context lines overlap,
 * the ranges are merged to create a single range.
 */
function makeLineReaderRanges(lines: number[], linecontext: number): ReadlineRange[] {
  if (!lines.length) {
    return [];
  }

  let i = 0;
  let current = makeContextRange(lines[i], linecontext);
  const out: ReadlineRange[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (i === lines.length - 1) {
      out.push(current);
      break;
    }

    // If the next line falls into the current range, extend the current range to lineno + linecontext.
    const next = lines[i + 1];
    if (next <= current[1]) {
      current[1] = next + linecontext;
    } else {
      out.push(current);
      current = makeContextRange(next, linecontext);
    }

    i++;
  }

  return out;
}

/**
 * Extracts lines from a file and stores them in a cache.
 */
function getContextLinesFromFile(path: string, ranges: ReadlineRange[], output: Record<number, string>): Promise<void> {
  return new Promise((resolve, _reject) => {
    // It is important *not* to have any async code between createInterface and the 'line' event listener
    // as it will cause the 'line' event to
    // be emitted before the listener is attached.
    const fileStream = createInterface({
      input: createReadStream(path),
    });

    // Init at zero and increment at the start of the loop because lines are 1 indexed.
    let lineNumber = 0;
    let currentRangeIndex = 0;
    let rangeStart = ranges[currentRangeIndex][0];
    let rangeEnd = ranges[currentRangeIndex][1];

    fileStream.on('line', line => {
      lineNumber++;
      if (lineNumber < rangeStart) return;

      // !Warning: Mutates the cache value
      output[lineNumber] = line;

      if (lineNumber >= rangeEnd) {
        if (currentRangeIndex === ranges.length - 1) {
          // We need to close the file stream and remove listeners, else the reader will continue to run our listener;
          fileStream.close();
          fileStream.removeAllListeners();
          return;
        }
        currentRangeIndex++;
        rangeStart = ranges[currentRangeIndex][0];
        rangeEnd = ranges[currentRangeIndex][1];
      }
    });

    fileStream.on('close', resolve);
    // We use this inside Promise.all, so we need to resolve the promise even if there is an error
    // to prevent Promise.all from short circuiting the rest.
    fileStream.on('error', e => {
      DEBUG_BUILD && logger.error(`Failed to read file: ${path}. Error: ${e}`);
      resolve();
    });
  });
}

async function addSourceContext(event: Event, contextLines: number): Promise<Event> {
  // keep a lookup map of which files we've already enqueued to read,
  // so we don't enqueue the same file multiple times which would cause multiple i/o reads
  const filesToLines: Record<string, number[]> = {};

  if (contextLines > 0 && event.exception?.values) {
    for (const exception of event.exception.values) {
      if (!exception.stacktrace?.frames?.length) {
        continue;
      }

      // Maps preserve insertion order, so we iterate in reverse, starting at the
      // outermost frame and closer to where the exception has occurred (poor mans priority)
      for (let i = exception.stacktrace.frames.length - 1; i >= 0; i--) {
        const frame = exception.stacktrace.frames[i];

        if (
          typeof frame.filename !== 'string' ||
          typeof frame.lineno !== 'number' ||
          shouldSkipContextLinesForFile(frame.filename)
        ) {
          continue;
        }

        if (!filesToLines[frame.filename]) filesToLines[frame.filename] = [];
        filesToLines[frame.filename].push(frame.lineno);
      }
    }
  }

  const files = Object.keys(filesToLines);
  if (files.length == 0) {
    return event;
  }

  const readlinePromises: Promise<void>[] = [];
  for (const file of files) {
    // Sort ranges so that they are sorted by line increasing order and match how the file is read.
    filesToLines[file].sort((a, b) => a - b);
    const ranges = makeLineReaderRanges(filesToLines[file], contextLines);

    // If the contents are already in the cache, then we dont need to read the file.
    if (ranges.every(r => rangeExistsInContentCache(file, r))) {
      continue;
    }

    let cache = LRU_FILE_CONTENTS_CACHE.get(file);
    if (!cache) {
      cache = {};
      LRU_FILE_CONTENTS_CACHE.set(file, cache);
    }
    readlinePromises.push(getContextLinesFromFile(file, ranges, cache));
  }

  // The promise rejections are caught in order to prevent them from short circuiting Promise.all
  await Promise.all(readlinePromises).catch(() => {
    DEBUG_BUILD && logger.log('Failed to read one or more source files and resolve context lines');
  });

  // Perform the same loop as above, but this time we can assume all files are in the cache
  // and attempt to add source context to frames.
  if (contextLines > 0 && event.exception?.values) {
    for (const exception of event.exception.values) {
      if (exception.stacktrace && exception.stacktrace.frames && exception.stacktrace.frames.length > 0) {
        addSourceContextToFrames(exception.stacktrace.frames, contextLines, LRU_FILE_CONTENTS_CACHE);
      }
    }
  }

  return event;
}

/** Adds context lines to frames */
function addSourceContextToFrames(
  frames: StackFrame[],
  contextLines: number,
  cache: LRUMap<string, Record<number, string>>,
): void {
  for (const frame of frames) {
    // Only add context if we have a filename and it hasn't already been added
    if (frame.filename && frame.context_line === undefined && typeof frame.lineno === 'number') {
      const contents = cache.get(frame.filename);
      if (contents) {
        addContextToFrame(frame.lineno, frame, contextLines, contents);
      }
    }
  }
}

/**
 * Clears the context lines from a frame, used to reset a frame to its original state
 * if we fail to resolve all context lines for it.
 */
function clearLineContext(frame: StackFrame): void {
  delete frame.pre_context;
  delete frame.context_line;
  delete frame.post_context;
}

/**
 * Resolves context lines before and after the given line number and appends them to the frame;
 */
export function addContextToFrame(
  lineno: number,
  frame: StackFrame,
  contextLines: number,
  contents: Record<number, string> | undefined,
): void {
  // When there is no line number in the frame, attaching context is nonsensical and will even break grouping.
  // We already check for lineno before calling this, but since StackFrame lineno ism optional, we check it again.
  if (frame.lineno === undefined || contents === undefined) {
    DEBUG_BUILD && logger.error('Cannot resolve context for frame with no lineno or file contents');
    return;
  }

  frame.pre_context = [];
  for (let i = makeRangeStart(lineno, contextLines); i < lineno; i++) {
    // We always expect the start context as line numbers cannot be negative. If we dont find a line, then
    // something went wrong somewhere. Clear the context and return without adding any linecontext.
    if (contents[i] === undefined) {
      clearLineContext(frame);
      DEBUG_BUILD && logger.error(`Could not find line ${i} in file ${frame.filename}`);
      return;
    }

    frame.pre_context.push(snipLine(contents[i], 0));
  }

  // We should always have the context line. If we dont, something went wrong, so we clear the context and return
  // without adding any linecontext.
  if (contents[lineno] === undefined) {
    clearLineContext(frame);
    DEBUG_BUILD && logger.error(`Could not find line ${lineno} in file ${frame.filename}`);
    return;
  }
  frame.context_line = snipLine(contents[lineno], frame.colno || 0);

  const end = makeRangeEnd(lineno, contextLines);
  frame.post_context = [];
  for (let i = lineno + 1; i <= end; i++) {
    // Since we dont track when the file ends, we cant clear the context if we dont find a line as it could
    // just be that we reached the end of the file.
    if (contents[i] === undefined) {
      break;
    }
    frame.post_context.push(snipLine(contents[i], 0));
  }
}

// Helper functions for generating line context ranges. They take a line number and the number of lines of context to
// include before and after the line and generate an inclusive range of indices.
type ReadlineRange = [start: number, end: number];
// Compute inclusive end context range
function makeRangeStart(line: number, linecontext: number): number {
  return Math.max(1, line - linecontext);
}
// Compute inclusive start context range
function makeRangeEnd(line: number, linecontext: number): number {
  return line + linecontext;
}
// Determine start and end indices for context range (inclusive);
function makeContextRange(line: number, linecontext: number): [start: number, end: number] {
  return [makeRangeStart(line, linecontext), makeRangeEnd(line, linecontext)];
}

/** Exported only for tests, as a type-safe variant. */
export const _contextLinesIntegration = ((options: ContextLinesOptions = {}) => {
  const contextLines = options.frameContextLines !== undefined ? options.frameContextLines : DEFAULT_LINES_OF_CONTEXT;

  return {
    name: INTEGRATION_NAME,
    processEvent(event) {
      return addSourceContext(event, contextLines);
    },
  };
}) satisfies IntegrationFn;

/**
 * Capture the lines before and after the frame's context.
 */
export const contextLinesIntegration = defineIntegration(_contextLinesIntegration);
