import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { defineIntegration } from '@sentry/core';
import type { Event, IntegrationFn, StackFrame } from '@sentry/types';
import { logger, LRUMap, snipLine } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';

const DEFAULT_LINES_OF_CONTEXT = 7;
const INTEGRATION_NAME = 'ContextLines';

// Exported for tests
export const LRUFileContentCache = new LRUMap<string, Record<number, string>>(10);

/**
 * Exists for testing purposes.
 */
export function resetFileContentCache(): void {
  LRUFileContentCache.clear();
}

/**
 * Creates contiguous ranges of lines to read from a file. In the case where context lines overlap,
 * the ranges are merged to create a single range that includes both sets of lines.
 * @param lines
 * @param linecontext
 * @returns
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

    // We need to create contiguous ranges in cases where context lines overlap so that
    // the final set of ranges is an increasing sequence of lines without overlaps.
    const next = lines[i + 1];
    if (next <= current[1]) {
      current[1] = next + linecontext + 1;
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

      // Mutates the cache value directly
      output[lineNumber] = line;
      // or if there are other ranges to process. If so, update the range
      // and continue processing the file, else break from the loop.
      if (lineNumber >= rangeEnd) {
        if (currentRangeIndex === ranges.length - 1) {
          // We need to close the file stream and remove listeners, else it wont close.
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

interface ContextLinesOptions {
  /**
   * Sets the number of context lines for each frame when loading a file.
   * Defaults to 7.
   *
   * Set to 0 to disable loading and inclusion of source files.
   **/
  frameContextLines?: number;
}

/** Exported on
 * ly for tests, as a type-safe variant. */
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

async function addSourceContext(event: Event, contextLines: number): Promise<Event> {
  // keep a lookup map of which files we've already enqueued to read,
  // so we don't enqueue the same file multiple times which would cause multiple i/o reads
  const filesToLines: Record<string, number[]> = {};

  if (contextLines > 0 && event.exception?.values) {
    for (const exception of event.exception.values) {
      if (!exception.stacktrace?.frames) {
        continue;
      }

      // Maps preserve insertion order, so we iterate in reverse, starting at the
      // outermost frame and closer to where the exception has occurred (poor mans priority)
      for (let i = exception.stacktrace.frames.length - 1; i >= 0; i--) {
        const frame = exception.stacktrace.frames[i];

        // Collecting context lines for minified code is useless.
        // @TODO omit builtin modules
        if (frame.filename?.endsWith('.min.js')) {
          continue;
        }

        if (frame.filename && typeof frame.lineno === 'number') {
          if (!filesToLines[frame.filename]) filesToLines[frame.filename] = [];
          filesToLines[frame.filename].push(frame.lineno);
        }
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

    let cache = LRUFileContentCache.get(file);
    if (!cache) {
      cache = {};
      LRUFileContentCache.set(file, cache);
    }
    readlinePromises.push(getContextLinesFromFile(file, ranges, cache));
  }

  await Promise.all(readlinePromises).catch(() => {
    // We don't want to error if we can't read the file.
    DEBUG_BUILD && logger.log('Failed to read one or more source files and resolve context lines');
  });

  // Perform the same loop as above, but this time we can assume all files are in the cache
  // and attempt to add source context to frames.
  if (contextLines > 0 && event.exception?.values) {
    for (const exception of event.exception.values) {
      if (exception.stacktrace && exception.stacktrace.frames && exception.stacktrace.frames.length > 0) {
        addSourceContextToFrames(exception.stacktrace.frames, contextLines, LRUFileContentCache);
      }
    }
  }

  return event;
}

/** Adds context lines to frames */
function addSourceContextToFrames(frames: StackFrame[], contextLines: number, cache: LRUMap<string, Record<number, string>>): void {
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
    return;
  }

  frame.pre_context = [];
  for (let i = makeRangeStart(lineno, contextLines); i < lineno; i++) {
    // Make sure to never send partial context lines
    if (contents[i] === undefined) {
      clearLineContext(frame);
      DEBUG_BUILD && logger.error(`Could not find line ${i} in file ${frame.filename}`);
      console.log('Pre, could not find line', i, 'in file', frame.filename);
      return;
    }

    frame.pre_context.push(snipLine(contents[i], 0));
  }

  if (contents[lineno] === undefined) {
    clearLineContext(frame);
    DEBUG_BUILD && logger.error(`Could not find line ${lineno} in file ${frame.filename}`);
    console.log('Lineno, could not find line', lineno, 'in file', frame.filename);
    return;
  }
  frame.context_line = snipLine(contents[lineno], frame.colno || 0);

  frame.post_context = [];
  for (let i = lineno + 1; i < makeRangeEnd(lineno, contextLines); i++) {
    if (contents[i] === undefined) {
      clearLineContext(frame);
      DEBUG_BUILD && logger.error(`Could not find line ${lineno} in file ${frame.filename}`);
      console.log('Post, could not find line', i, 'in file', frame.filename)
      return;
    }

    frame.post_context.push(snipLine(contents[i], 0));
  }
}

// Helper functions for generating line context ranges. They take a line number and the number of lines of context to
// include before and after the line and generate an inclusive range of indices.
type ReadlineRange = [start: number, end: number];
function makeRangeStart(line: number, linecontext: number): number {
  return Math.max(1, line - linecontext);
}
function makeRangeEnd(line: number, linecontext: number): number {
  return line + linecontext + 1;
}
function makeContextRange(line: number, linecontext: number): [start: number, end: number] {
  return [makeRangeStart(line, linecontext), makeRangeEnd(line, linecontext)];
}
