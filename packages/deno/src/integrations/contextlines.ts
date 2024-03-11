import { defineIntegration } from '@sentry/core';
import type { Event, IntegrationFn, StackFrame } from '@sentry/types';
import { LRUMap, addContextToFrame } from '@sentry/utils';

const INTEGRATION_NAME = 'ContextLines';
const FILE_CONTENT_CACHE = new LRUMap<string, string | null>(100);
const DEFAULT_LINES_OF_CONTEXT = 7;

/**
 * Resets the file cache. Exists for testing purposes.
 * @hidden
 */
export function resetFileContentCache(): void {
  FILE_CONTENT_CACHE.clear();
}

/**
 * Reads file contents and caches them in a global LRU cache.
 *
 * @param filename filepath to read content from.
 */
async function readSourceFile(filename: string): Promise<string | null> {
  const cachedFile = FILE_CONTENT_CACHE.get(filename);
  // We have a cache hit
  if (cachedFile !== undefined) {
    return cachedFile;
  }

  let content: string | null = null;
  try {
    content = await Deno.readTextFile(filename);
  } catch (_) {
    //
  }

  FILE_CONTENT_CACHE.set(filename, content);
  return content;
}

interface ContextLinesOptions {
  /**
   * Sets the number of context lines for each frame when loading a file.
   * Defaults to 7.
   *
   * Set to 0 to disable loading and inclusion of source files.
   */
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

/**
 * Adds source context to event stacktraces.
 *
 * Enabled by default in the Deno SDK.
 *
 * ```js
 * Sentry.init({
 *   integrations: [
 *     Sentry.contextLinesIntegration(),
 *   ],
 * })
 * ```
 */
export const contextLinesIntegration = defineIntegration(_contextLinesIntegration);

/** Processes an event and adds context lines */
async function addSourceContext(event: Event, contextLines: number): Promise<Event> {
  if (contextLines > 0 && event.exception && event.exception.values) {
    for (const exception of event.exception.values) {
      if (exception.stacktrace && exception.stacktrace.frames) {
        await addSourceContextToFrames(exception.stacktrace.frames, contextLines);
      }
    }
  }

  return event;
}

/** Adds context lines to frames */
async function addSourceContextToFrames(frames: StackFrame[], contextLines: number): Promise<void> {
  for (const frame of frames) {
    // Only add context if we have a filename and it hasn't already been added
    if (frame.filename && frame.in_app && frame.context_line === undefined) {
      const permission = await Deno.permissions.query({
        name: 'read',
        path: frame.filename,
      });

      if (permission.state == 'granted') {
        const sourceFile = await readSourceFile(frame.filename);

        if (sourceFile) {
          try {
            const lines = sourceFile.split('\n');
            addContextToFrame(lines, frame, contextLines);
          } catch (_) {
            // anomaly, being defensive in case
            // unlikely to ever happen in practice but can definitely happen in theory
          }
        }
      }
    }
  }
}
