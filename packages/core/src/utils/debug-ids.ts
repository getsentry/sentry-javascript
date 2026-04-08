import type { DebugImage } from '../types-hoist/debugMeta';
import type { StackParser } from '../types-hoist/stacktrace';
import { normalizeStackTracePath } from './stacktrace';
import { GLOBAL_OBJ } from './worldwide';

type StackString = string;
type CachedResult = [string, string];

let parsedStackResults: Record<StackString, CachedResult> | undefined;
let lastSentryKeysCount: number | undefined;
let lastNativeKeysCount: number | undefined;
let cachedFilenameDebugIds: Record<string, string> | undefined;

/**
 * Clears the cached debug ID mappings.
 * Useful for testing or when the global debug ID state changes.
 */
export function clearDebugIdCache(): void {
  parsedStackResults = undefined;
  lastSentryKeysCount = undefined;
  lastNativeKeysCount = undefined;
  cachedFilenameDebugIds = undefined;
}

/**
 * Returns a map of filenames to debug identifiers.
 * Supports both proprietary _sentryDebugIds and native _debugIds (e.g., from Vercel) formats.
 */
export function getFilenameToDebugIdMap(stackParser: StackParser): Record<string, string> {
  const sentryDebugIdMap = GLOBAL_OBJ._sentryDebugIds;
  const nativeDebugIdMap = GLOBAL_OBJ._debugIds;

  if (!sentryDebugIdMap && !nativeDebugIdMap) {
    return {};
  }

  const sentryDebugIdKeys = sentryDebugIdMap ? Object.keys(sentryDebugIdMap) : [];
  const nativeDebugIdKeys = nativeDebugIdMap ? Object.keys(nativeDebugIdMap) : [];

  // If the count of registered globals hasn't changed since the last call, we
  // can just return the cached result.
  if (
    cachedFilenameDebugIds &&
    sentryDebugIdKeys.length === lastSentryKeysCount &&
    nativeDebugIdKeys.length === lastNativeKeysCount
  ) {
    return cachedFilenameDebugIds;
  }

  lastSentryKeysCount = sentryDebugIdKeys.length;
  lastNativeKeysCount = nativeDebugIdKeys.length;

  // Build a map of filename -> debug_id from both sources
  cachedFilenameDebugIds = {};

  if (!parsedStackResults) {
    parsedStackResults = {};
  }

  const processDebugIds = (debugIdKeys: string[], debugIdMap: Record<string, string>): void => {
    for (const key of debugIdKeys) {
      const debugId = debugIdMap[key];
      const result = parsedStackResults?.[key];

      if (result && cachedFilenameDebugIds && debugId) {
        // Use cached filename but update with current debug ID
        cachedFilenameDebugIds[result[0]] = debugId;
        // Update cached result with new debug ID
        if (parsedStackResults) {
          parsedStackResults[key] = [result[0], debugId];
        }
      } else if (debugId) {
        const parsedStack = stackParser(key);

        for (let i = parsedStack.length - 1; i >= 0; i--) {
          const stackFrame = parsedStack[i];
          const filename = stackFrame?.filename;

          if (filename && cachedFilenameDebugIds && parsedStackResults) {
            cachedFilenameDebugIds[filename] = debugId;
            parsedStackResults[key] = [filename, debugId];
            break;
          }
        }
      }
    }
  };

  if (sentryDebugIdMap) {
    processDebugIds(sentryDebugIdKeys, sentryDebugIdMap);
  }

  // Native _debugIds will override _sentryDebugIds if same file
  if (nativeDebugIdMap) {
    processDebugIds(nativeDebugIdKeys, nativeDebugIdMap);
  }

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
    const normalizedPath = normalizeStackTracePath(path);
    if (normalizedPath && filenameDebugIdMap[normalizedPath]) {
      images.push({
        type: 'sourcemap',
        code_file: path,
        debug_id: filenameDebugIdMap[normalizedPath],
      });
    }
  }

  return images;
}
