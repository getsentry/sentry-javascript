import { StackFrame } from '@sentry/types';
import { addContextToFrame, SyncPromise } from '@sentry/utils';
import { readFile } from 'fs';
import { LRUMap } from 'lru_map';

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

/** */
export function addSourcesToFrames(frames: StackFrame[], options?: NodeOptions): PromiseLike<StackFrame[]> {
  const linesOfContext =
    options && options.frameContextLines !== undefined ? options.frameContextLines : DEFAULT_LINES_OF_CONTEXT;

  if (linesOfContext <= 0) {
    return SyncPromise.resolve(frames);
  }

  const filesToRead: string[] = [];

  for (const frame of frames) {
    if (
      frame.filename &&
      filesToRead.indexOf(frame.filename) === -1 &&
      // We want to include sources for files that are in_app and in node_modules
      (frame.in_app || frame.filename.indexOf('node_modules/') !== -1)
    ) {
      filesToRead.push(frame.filename);
    }
  }

  try {
    return readFilesAddPrePostContext(filesToRead, frames, linesOfContext);
  } catch (_) {
    // This happens in electron for example where we are not able to read files from asar.
    // So it's fine, we recover be just returning all frames without pre/post context.
  }

  return SyncPromise.resolve(frames);
}

/**
 * This function tries to read the source files + adding pre and post context (source code)
 * to a frame.
 * @param filesToRead string[] of filepaths
 * @param frames StackFrame[] containg all frames
 */
function readFilesAddPrePostContext(
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
