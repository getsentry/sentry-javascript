import type { DebugImage, StackParser } from '@sentry/types';
import { GLOBAL_OBJ } from './worldwide';

type StackString = string;

interface CachedResult {
  filename: string;
  debugId: string;
}

let debugIdStackParserCache: WeakMap<StackParser, Map<StackString, CachedResult>> | undefined;

function getCacheForStackParser(stackParser: StackParser): Map<StackString, CachedResult> {
  if (!debugIdStackParserCache) {
    debugIdStackParserCache = new WeakMap();
  }

  let result = debugIdStackParserCache.get(stackParser);

  if (!result) {
    result = new Map();
    debugIdStackParserCache.set(stackParser, result);
  }

  return result;
}

let lastDebugIdKeyCount = 0;
let cachedFilenameToDebugId: Map<string, string> | undefined;

/**
 * Returns a map of filenames to debug identifiers.
 */
export function getFilenameToDebugIdMap(stackParser: StackParser): Map<string, string> | undefined {
  const debugIdMap = GLOBAL_OBJ._sentryDebugIds;
  if (!debugIdMap) {
    return undefined;
  }

  const debugIdKeys = Object.keys(debugIdMap);

  // If the count of registered globals hasn't changed since the last call, we
  // can just return the cached result.
  if (debugIdKeys.length === lastDebugIdKeyCount && cachedFilenameToDebugId) {
    return cachedFilenameToDebugId;
  }

  const debugIdStackFramesCache = getCacheForStackParser(stackParser);

  // Build a map of filename -> debug_id.
  const output = debugIdKeys.reduce<Map<string, string>>((acc, debugIdStackTrace) => {
    let result = debugIdStackFramesCache.get(debugIdStackTrace);

    if (!result) {
      const parsedStack = stackParser(debugIdStackTrace);

      for (let i = parsedStack.length - 1; i >= 0; i--) {
        const stackFrame = parsedStack[i];
        const filename = stackFrame && stackFrame.filename;
        const debugId = debugIdMap[debugIdStackTrace];

        if (filename && debugId) {
          result = { filename, debugId };
          debugIdStackFramesCache.set(debugIdStackTrace, result);
          break;
        }
      }
    }

    if (result) {
      acc.set(result.filename, result.debugId);
    }

    return acc;
  }, new Map());

  lastDebugIdKeyCount = Object.keys(debugIdMap).length;
  cachedFilenameToDebugId = output;

  return output;
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
    const debug_id = filenameDebugIdMap.get(path);
    if (path && debug_id) {
      images.push({
        type: 'sourcemap',
        code_file: path,
        debug_id,
      });
    }
  }

  return images;
}
