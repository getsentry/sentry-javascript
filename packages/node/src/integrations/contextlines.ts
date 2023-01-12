import type { Event, EventProcessor, Integration, StackFrame } from '@sentry/types';
import { addContextToFrame } from '@sentry/utils';
import { readFile } from 'fs';
import { LRUMap } from 'lru_map';

const FILE_CONTENT_CACHE = new LRUMap<string, string | null>(100);
const DEFAULT_LINES_OF_CONTEXT = 7;

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

/** Add node modules / packages to the event */
export class ContextLines implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'ContextLines';

  /**
   * @inheritDoc
   */
  public name: string = ContextLines.id;

  public constructor(private readonly _options: ContextLinesOptions = {}) {}

  /** Get's the number of context lines to add */
  private get _contextLines(): number {
    return this._options.frameContextLines !== undefined ? this._options.frameContextLines : DEFAULT_LINES_OF_CONTEXT;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    addGlobalEventProcessor(event => this.addSourceContext(event));
  }

  /** Processes an event and adds context lines */
  public async addSourceContext(event: Event): Promise<Event> {
    if (this._contextLines > 0 && event.exception?.values) {
      for (const exception of event.exception.values) {
        if (exception.stacktrace?.frames) {
          await this.addSourceContextToFrames(exception.stacktrace.frames);
        }
      }
    }

    return event;
  }

  /** Adds context lines to frames */
  public async addSourceContextToFrames(frames: StackFrame[]): Promise<void> {
    const contextLines = this._contextLines;

    for (const frame of frames) {
      // Only add context if we have a filename and it hasn't already been added
      if (frame.filename && frame.context_line === undefined) {
        const sourceFile = await _readSourceFile(frame.filename);

        if (sourceFile) {
          try {
            const lines = sourceFile.split('\n');
            addContextToFrame(lines, frame, contextLines);
          } catch (e) {
            // anomaly, being defensive in case
            // unlikely to ever happen in practice but can definitely happen in theory
          }
        }
      }
    }
  }
}

/**
 * Reads file contents and caches them in a global LRU cache.
 *
 * @param filename filepath to read content from.
 */
async function _readSourceFile(filename: string): Promise<string | null> {
  const cachedFile = FILE_CONTENT_CACHE.get(filename);
  // We have a cache hit
  if (cachedFile !== undefined) {
    return cachedFile;
  }

  let content: string | null = null;
  try {
    content = await readTextFileAsync(filename);
  } catch (_) {
    //
  }

  FILE_CONTENT_CACHE.set(filename, content);
  return content;
}
