import type { DebugImage, StackParser } from '@sentry/types';
import { GLOBAL_OBJ } from './worldwide';

type StackString = string;
type CachedResult = [string, string];

let debugIdStackParserCache: WeakMap<StackParser, Record<StackString, CachedResult>> | undefined;

function getCacheForStackParser(stackParser: StackParser): Record<StackString, CachedResult> {
  if (!debugIdStackParserCache) {
    debugIdStackParserCache = new WeakMap();
  }

  let result = debugIdStackParserCache.get(stackParser);

  if (!result) {
    result = {};
    debugIdStackParserCache.set(stackParser, result);
  }

  return result;
}

let lastCount = 0;
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
  if (cachedFilenameDebugIds && debugIdKeys.length === lastCount) {
    return cachedFilenameDebugIds;
  }

  const debugIdStackFramesCache = getCacheForStackParser(stackParser);

  // Build a map of filename -> debug_id.
  cachedFilenameDebugIds = debugIdKeys.reduce<Record<string, string>>((acc, debugIdStackTrace) => {
    const result = debugIdStackFramesCache[debugIdStackTrace];

    if (result) {
      acc[result[0]] = result[1];
    } else {
      const parsedStack = stackParser(debugIdStackTrace);

      for (let i = parsedStack.length - 1; i >= 0; i--) {
        const stackFrame = parsedStack[i];
        const filename = stackFrame && stackFrame.filename;
        const debugId = debugIdMap[debugIdStackTrace];

        if (filename && debugId) {
          acc[filename] = debugId;
          debugIdStackFramesCache[debugIdStackTrace] = [filename, debugId];
          break;
        }
      }
    }

    return acc;
  }, {});

  lastCount = debugIdKeys.length;

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
