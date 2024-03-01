import { readFile } from 'fs';
import { defineIntegration } from '@sentry/core';
import type { Event, IntegrationFn, StackFrame } from '@sentry/types';
import { LRUMap, addContextToFrame } from '@sentry/utils';

const FILE_CONTENT_CACHE = new LRUMap<string, string[] | null>(100);
const DEFAULT_LINES_OF_CONTEXT = 7;
const INTEGRATION_NAME = 'ContextLines';

// TODO: Replace with promisify when minimum supported node >= v8
function readTextFileAsync(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    readFile(path, 'utf8', (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

/**
 * Resets the file cache. Exists for testing purposes.
 * @hidden
 */
export function resetFileContentCache(): void {
  FILE_CONTENT_CACHE.clear();
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

const _contextLinesIntegration = ((options: ContextLinesOptions = {}) => {
  const contextLines = options.frameContextLines !== undefined ? options.frameContextLines : DEFAULT_LINES_OF_CONTEXT;

  return {
    name: INTEGRATION_NAME,
    processEvent(event) {
      return addSourceContext(event, contextLines);
    },
  };
}) satisfies IntegrationFn;

export const contextLinesIntegration = defineIntegration(_contextLinesIntegration);

async function addSourceContext(event: Event, contextLines: number): Promise<Event> {
  // keep a lookup map of which files we've already enqueued to read,
  // so we don't enqueue the same file multiple times which would cause multiple i/o reads
  const enqueuedReadSourceFileTasks: Record<string, number> = {};
  const readSourceFileTasks: Promise<string[] | null>[] = [];

  if (contextLines > 0 && event.exception?.values) {
    for (const exception of event.exception.values) {
      if (!exception.stacktrace?.frames) {
        continue;
      }

      // We want to iterate in reverse order as calling cache.get will bump the file in our LRU cache.
      // This ends up prioritizes source context for frames at the top of the stack instead of the bottom.
      for (let i = exception.stacktrace.frames.length - 1; i >= 0; i--) {
        const frame = exception.stacktrace.frames[i];
        // Call cache.get to bump the file to the top of the cache and ensure we have not already
        // enqueued a read operation for this filename
        if (frame.filename && !enqueuedReadSourceFileTasks[frame.filename] && !FILE_CONTENT_CACHE.get(frame.filename)) {
          readSourceFileTasks.push(_readSourceFile(frame.filename));
          enqueuedReadSourceFileTasks[frame.filename] = 1;
        }
      }
    }
  }

  // check if files to read > 0, if so, await all of them to be read before adding source contexts.
  // Normally, Promise.all here could be short circuited if one of the promises rejects, but we
  // are guarding from that by wrapping the i/o read operation in a try/catch.
  if (readSourceFileTasks.length > 0) {
    await Promise.all(readSourceFileTasks);
  }

  // Perform the same loop as above, but this time we can assume all files are in the cache
  // and attempt to add source context to frames.
  if (contextLines > 0 && event.exception?.values) {
    for (const exception of event.exception.values) {
      if (exception.stacktrace && exception.stacktrace.frames) {
        await addSourceContextToFrames(exception.stacktrace.frames, contextLines);
      }
    }
  }

  return event;
}

/** Adds context lines to frames */
function addSourceContextToFrames(frames: StackFrame[], contextLines: number): void {
  for (const frame of frames) {
    // Only add context if we have a filename and it hasn't already been added
    if (frame.filename && frame.context_line === undefined) {
      const sourceFileLines = FILE_CONTENT_CACHE.get(frame.filename);

      if (sourceFileLines) {
        try {
          addContextToFrame(sourceFileLines, frame, contextLines);
        } catch (e) {
          // anomaly, being defensive in case
          // unlikely to ever happen in practice but can definitely happen in theory
        }
      }
    }
  }
}

/**
 * Reads file contents and caches them in a global LRU cache.
 * If reading fails, mark the file as null in the cache so we don't try again.
 *
 * @param filename filepath to read content from.
 */
async function _readSourceFile(filename: string): Promise<string[] | null> {
  const cachedFile = FILE_CONTENT_CACHE.get(filename);

  // We have already attempted to read this file and failed, do not try again
  if (cachedFile === null) {
    return null;
  }

  // We have a cache hit, return it
  if (cachedFile !== undefined) {
    return cachedFile;
  }

  // Guard from throwing if readFile fails, this enables us to use Promise.all and
  // not have it short circuiting if one of the promises rejects + since context lines are added
  // on a best effort basis, we want to throw here anyways.

  // If we made it to here, it means that our file is not cache nor marked as failed, so attempt to read it
  let content: string[] | null = null;
  try {
    const rawFileContents = await readTextFileAsync(filename);
    content = rawFileContents.split('\n');
  } catch (_) {
    // if we fail, we will mark the file as null in the cache and short circuit next time we try to read it
  }

  FILE_CONTENT_CACHE.set(filename, content);
  return content;
}
