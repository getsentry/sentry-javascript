import type { DebugImage, StackParser } from '../types-hoist';
import { GLOBAL_OBJ } from './worldwide';

type StackString = string;
type CachedResult = [string, string];

let parsedStackResults: Record<StackString, CachedResult> | undefined;
let lastKeysCount: number | undefined;
let cachedFilenameDebugIds: Record<string, string> | undefined;

/**
 * Returns a map of filenames to debug identifiers.
 */
export function getFilenameToDebugIdMap(stackParser: StackParser): Record<string, string> {
  const debugIdMap = GLOBAL_OBJ._sentryDebugIds;
  if (!debugIdMap) {
    return {};
  }

  const debugIdKeys = Object.keys(debugIdMap);

  // If the count of registered globals hasn't changed since the last call, we
  // can just return the cached result.
  if (cachedFilenameDebugIds && debugIdKeys.length === lastKeysCount) {
    return cachedFilenameDebugIds;
  }

  lastKeysCount = debugIdKeys.length;

  // Build a map of filename -> debug_id.
  cachedFilenameDebugIds = debugIdKeys.reduce<Record<string, string>>((acc, stackKey) => {
    if (!parsedStackResults) {
      parsedStackResults = {};
    }

    const result = parsedStackResults[stackKey];

    if (result) {
      acc[result[0]] = result[1];
    } else {
      const parsedStack = stackParser(stackKey);

      for (let i = parsedStack.length - 1; i >= 0; i--) {
        const stackFrame = parsedStack[i];
        const filename = stackFrame && stackFrame.filename;
        const debugId = debugIdMap[stackKey];

        if (filename && debugId) {
          acc[filename] = debugId;
          parsedStackResults[stackKey] = [filename, debugId];
          break;
        }
      }
    }

    return acc;
  }, {});

  return cachedFilenameDebugIds;
}

/**
 * Returns a list of debug images for the given resources.
 */
export function getDebugImagesForResources(
  stackParser: StackParser,
  resource_paths: ReadonlyArray<string>,
): DebugImage[] {
  const filenameDebugIdMap = getFilenameToDebugIdMap(stackParser);

  if (!filenameDebugIdMap) {
    return [];
  }

  const images: DebugImage[] = [];
  for (const path of resource_paths) {
    if (path && filenameDebugIdMap[path]) {
      images.push({
        type: 'sourcemap',
        code_file: path,
        debug_id: filenameDebugIdMap[path] as string,
      });
    }
  }

  return images;
}
