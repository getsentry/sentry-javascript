import { getCurrentHub } from '@sentry/core';
import { Event, EventProcessor, Integration } from '@sentry/types';
import { addContextToFrame } from '@sentry/utils';
import { readFile } from 'fs';
import { LRUMap } from 'lru_map';

import { NodeClient } from '../client';

const FILE_CONTENT_CACHE = new LRUMap<string, string | null>(100);

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
   * Sets the number of context lines for each frame when loading a file
   *
   * Set to 0 to disable loading and inclusion of source files.
   * */
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

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    if (this._options.frameContextLines == undefined) {
      const initOptions = getCurrentHub().getClient<NodeClient>()?.getOptions();
      // eslint-disable-next-line deprecation/deprecation
      this._options.frameContextLines = initOptions?.frameContextLines;
    }

    addGlobalEventProcessor(event => this.addToEvent(event));
  }

  /** Processes an event and adds context lines */
  public async addToEvent(event: Event): Promise<Event> {
    const contextLines = this._options.frameContextLines == undefined ? 7 : this._options.frameContextLines;

    const frames = event.exception?.values?.[0].stacktrace?.frames;

    if (frames && contextLines > 0) {
      const filenames: string[] = [];

      for (const frame of frames) {
        if (frame.filename && !filenames.includes(frame.filename)) {
          filenames.push(frame.filename);
        }
      }

      const sourceFiles = await readSourceFiles(filenames);

      for (const frame of frames) {
        if (frame.filename && sourceFiles[frame.filename]) {
          try {
            const lines = (sourceFiles[frame.filename] as string).split('\n');
            addContextToFrame(lines, frame, contextLines);
          } catch (e) {
            // anomaly, being defensive in case
            // unlikely to ever happen in practice but can definitely happen in theory
          }
        }
      }

      return event;
    }

    return event;
  }
}

/**
 * This function reads file contents and caches them in a global LRU cache.
 *
 * @param filenames Array of filepaths to read content from.
 */
async function readSourceFiles(filenames: string[]): Promise<Record<string, string | null>> {
  // we're relying on filenames being de-duped already
  if (!filenames.length) {
    return {};
  }

  const sourceFiles: Record<string, string | null> = {};

  for (const filename of filenames) {
    const cache = FILE_CONTENT_CACHE.get(filename);
    // We have a cache hit
    if (cache !== undefined) {
      // If stored value is null, it means that we already tried, but couldn't read the content of the file. Skip.
      if (cache === null) {
        continue;
      }

      // Otherwise content is there, so reuse cached value.
      sourceFiles[filename] = cache;
      continue;
    }

    let content: string | null = null;
    try {
      content = await readTextFileAsync(filename);
    } catch (_) {
      //
    }

    FILE_CONTENT_CACHE.set(filename, content);
    sourceFiles[filename] = content;
  }

  return sourceFiles;
}
