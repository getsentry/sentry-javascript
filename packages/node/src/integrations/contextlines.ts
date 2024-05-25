import { createReadStream } from 'node:fs';
import * as readline from 'node:readline';
import { defineIntegration } from '@sentry/core';
import type { Event, IntegrationFn, StackFrame } from '@sentry/types';
import { logger, LRUMap, snipLine } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';

const DEFAULT_LINES_OF_CONTEXT = 7;
const INTEGRATION_NAME = 'ContextLines';
const LRUFileContentCache = new LRUMap<string, Record<number, string>>(10);

/**
 * Exists for testing purposes.
 */
export function resetFileContentCache(): void {
  LRUFileContentCache.clear();
}

function makeLineReaderRanges(lines: number[], linecontext: number): ReadlineRange[] {
  if (!lines.length) {
    return [];
  }

  const out: ReadlineRange[] = [];
  let i = 0;
  let current = makeContextRange(lines[i], linecontext);

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

// Stack trace comes in, parse it and extract stack filename + lines
// in case we receive lines from multiple files, the final output
// should contain files sorted by stack order importance - top first
// and should contain.
async function getContextLinesFromFile(
  path: string,
  ranges: ReadlineRange[],
  output: Record<number, string>,
): Promise<void> {
  const fileStream = readline.createInterface({
    input: createReadStream(path),
  });

  // Line numbers are 1 indexed
  let lineNumber = 1;
  let currentRangeIndex = 0;
  let rangeStart = ranges[currentRangeIndex][0];
  let rangeEnd = ranges[currentRangeIndex][1];

  for await (const line of fileStream) {
    lineNumber++;
    if (lineNumber < rangeStart) {
      continue;
    }

    output[lineNumber] = line;
    // or if there are other ranges to process. If so, update the range
    // and continue processing the file, else break from the loop.
    if (lineNumber >= rangeEnd) {
      if (currentRangeIndex === ranges.length - 1) {
        break;
      }
      currentRangeIndex++;
      rangeStart = ranges[currentRangeIndex][0];
      rangeEnd = ranges[currentRangeIndex][1];
    }
  }
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
        addSourceContextToFrames(exception.stacktrace.frames, LRUFileContentCache);
      }
    }
  }

  return event;
}

/** Adds context lines to frames */
function addSourceContextToFrames(frames: StackFrame[], cache: LRUMap<string, Record<number, string>>): void {
  for (const frame of frames) {
    // Only add context if we have a filename and it hasn't already been added
    if (frame.filename && frame.context_line === undefined && typeof frame.lineno === 'number') {
      const contents = cache.get(frame.filename);
      if (contents) {
        addContextToFrame(frame.lineno, frame, contents);
      }
    }
  }
}

/**
 * Resolves context lines before and after the given line number and appends them to the frame;
 */
export function addContextToFrame(
  lineno: number,
  frame: StackFrame,
  contents: Record<number, string> | undefined,
): void {
  // When there is no line number in the frame, attaching context is nonsensical and will even break grouping.
  // We already check for lineno before calling this, but since StackFrame lineno ism optional, we check it again.
  if (frame.lineno === undefined || contents === undefined) {
    return;
  }

  frame.pre_context = [];
  for (let i = makeRangeStart(lineno, DEFAULT_LINES_OF_CONTEXT); i < lineno; i++) {
    if (contents[i]) {
      frame.pre_context.push(snipLine(contents[i], 0));
    }
  }

  frame.context_line = snipLine(contents[lineno] || '', frame.colno || 0);

  frame.post_context = [];
  for (let i = lineno + 1; i < makeRangeEnd(lineno, DEFAULT_LINES_OF_CONTEXT); i++) {
    if (contents[i]) {
      frame.post_context.push(snipLine(contents[i], 0));
    }
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
